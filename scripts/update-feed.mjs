import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, createPublicKey, verify} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const stable = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  && value.split('.').every(component=>BigInt(component)<=18446744073709551615n);
const fail = message => {throw new Error(message);};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function base64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Invalid base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) fail('Noncanonical base64');
  return bytes;
}
function wrappedLines(value) {
  return base64(value.trim()).toString('utf8').split(/\r?\n/);
}

// Direct transcription of the installed official implementations identified in
// method.md. Node/OpenSSL performs Ed25519 and BLAKE2b-512; no signing support.
export function verifySignedBytes(bytes, signatureText, encodedPublicKey, announcedVersion) {
  if (!stable(announcedVersion)) fail('Invalid announced stable version');
  const keyLines = wrappedLines(encodedPublicKey);
  const signatureLines = wrappedLines(signatureText);
  const key = base64(keyLines[1]);
  const signature = base64(signatureLines[1]);
  const globalSignature = base64(signatureLines[3]);
  if (key.length !== 42 || signature.length !== 74 || globalSignature.length !== 64) fail('Invalid minisign packet size');
  if (!['Ed','ED'].includes(key.subarray(0,2).toString('ascii'))) fail('Unsupported public key algorithm');
  const algorithm = signature.subarray(0,2).toString('ascii');
  if (!['Ed','ED'].includes(algorithm)) fail('Unsupported signature algorithm');
  if (!key.subarray(2,10).equals(signature.subarray(2,10))) fail('Signing key ID mismatch');
  if (!signatureLines[2]?.startsWith('trusted comment: ')) fail('Invalid trusted comment');
  const trustedComment = signatureLines[2].slice(17);
  // RFC 8410 SubjectPublicKeyInfo Ed25519 OID 1.3.101.112, raw 32-byte key.
  const publicKey = createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key.subarray(10)]),format:'der',type:'spki'});
  const message = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  const rawSignature = signature.subarray(10);
  if (!verify(null, message, publicKey, rawSignature)) fail('Artifact signature rejected');
  if (!verify(null, Buffer.concat([rawSignature,Buffer.from(trustedComment,'utf8')]), publicKey, globalSignature)) fail('Trusted comment signature rejected');
  // Only read version after both signatures authenticate the trusted comment.
  const signedVersion = trustedComment.split('\t').find(field=>field.startsWith('version:'))?.slice(8);
  if (signedVersion === undefined) fail('Missing signed version');
  // Product policy accepts exact stable X.Y.Z. Tauri permits optional v in its
  // signed comment semver; both sides here have no prerelease/build metadata.
  if (signedVersion.replace(/^v+/, '') !== announcedVersion) fail('Signed version differs from announced version');
  return {announcedVersion,signedVersion,sha256:sha256(bytes),bytes:bytes.length};
}


export const RELEASE_REPOSITORY = 'Bendorithm/Bendorithm.github.io';
const assetName = 'Bendorithm-Setup.exe';
const identity = platform => platform && JSON.stringify([platform.url,platform.signature,platform.sha256,platform.bytes]);
function requireBoundedFeed(feed) {
  if(Buffer.byteLength(JSON.stringify(feed,null,2)+'\n','utf8')>128*1024)fail('Serialized feed exceeds native 128 KiB limit');
}
function compareVersions(left,right) {
  if (!stable(left)||!stable(right)) fail('Invalid current stable version');
  const a=left.split('.').map(BigInt),b=right.split('.').map(BigInt);
  for(let i=0;i<3;i++){if(a[i]>b[i])return 1;if(a[i]<b[i])return -1;}
  return 0;
}
export function buildVerifiedFeed({release,requestedTag,installer,signature,publicKey,currentFeed,currentConfig,uploadedFeed}) {
  if (!release || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(requestedTag) || release.tag_name !== requestedTag) fail('Invalid or mismatched release tag');
  if (release.draft !== false || release.prerelease !== false || typeof release.published_at !== 'string' || !Number.isFinite(Date.parse(release.published_at))) fail('Release must be a published stable release');
  if(typeof release.body!=='string'||!release.body.trim()||Buffer.byteLength(release.body)>64*1024)fail('Reviewed nonempty release notes are required');
  if(!currentConfig||typeof currentConfig!=='object'||Array.isArray(currentConfig))fail('Website config must be an object');
  if(currentFeed!=null&&!stable(currentFeed.version))fail('Invalid current feed version');
  const version=requestedTag.slice(1),signed=verifySignedBytes(installer,signature,publicKey,version);
  const platform={url:`https://github.com/${RELEASE_REPOSITORY}/releases/download/${requestedTag}/${assetName}`,signature:signature.trim(),sha256:signed.sha256,bytes:signed.bytes};
  const feed={version,notes:release.body.trim(),pub_date:new Date(release.published_at).toISOString(),platforms:{'windows-x86_64':platform}};
  requireBoundedFeed(feed);
  if(uploadedFeed!==undefined && (!uploadedFeed||typeof uploadedFeed!=='object'||Array.isArray(uploadedFeed)||uploadedFeed.version!==version||identity(uploadedFeed.platforms?.['windows-x86_64'])!==identity(platform)))fail('Uploaded manifest does not match verified release bytes');
  for(const current of [currentFeed?.version,currentConfig.version])if(current!=null&&compareVersions(version,current)<0)fail('Release downgrade rejected');
  const config={...currentConfig,releaseRepository:RELEASE_REPOSITORY,windowsAssetName:assetName,version};
  if(currentFeed?.version===version){
    if(identity(currentFeed.platforms?.['windows-x86_64'])!==identity(platform))fail('Same-version identity replacement rejected');
    if(currentConfig.version!==version||currentConfig.releaseRepository!==RELEASE_REPOSITORY||currentConfig.windowsAssetName!==assetName)fail('Same-version config is not already correct');
    requireBoundedFeed(currentFeed);
    return {feed:currentFeed,config:currentConfig,changed:false};
  }
  return {feed,config,changed:true};
}

export function releaseAssets(release,tag) {
  const result={};
  for(const name of [assetName,assetName+'.sig','stable.json']){
    const found=(release.assets??[]).filter(asset=>asset.name===name);
    if(found.length>1)fail('Duplicate release asset: '+name);
    if(!found.length){if(name==='stable.json')continue;fail('Required signed release asset missing: '+name);}
    const asset=found[0],url=`https://github.com/${RELEASE_REPOSITORY}/releases/download/${tag}/${name}`;
    if(asset.state!=='uploaded'||asset.browser_download_url!==url)fail('Invalid release asset identity: '+name);
    result[name]=asset;
  }
  return result;
}

export async function boundedFetch(url,{limit,apiToken,fetchImpl=fetch,artifact=false}={}) {
  let address=new URL(url);
  const hosts=artifact?new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']):new Set(['api.github.com']);
  for(let redirects=0;redirects<=5;redirects++){
    if(address.protocol!=='https:'||address.username||address.password||address.port||!hosts.has(address.hostname))fail('Untrusted download address');
    const headers=artifact?{}:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(apiToken?{Authorization:`Bearer ${apiToken}`}:{})};
    const response=await fetchImpl(address,{headers,redirect:'manual',signal:AbortSignal.timeout(artifact?300000:25000)});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');await response.body?.cancel();if(!location)fail('Redirect missing location');address=new URL(location,address);continue;
    }
    if(!response.ok)fail(`Release download failed (HTTP ${response.status})`);
    const advertised=response.headers.get('content-length');if(advertised&&Number(advertised)>limit)fail('Release asset exceeds size limit');
    const chunks=[];let length=0;
    for await(const chunk of response.body){length+=chunk.byteLength;if(length>limit)fail('Release asset exceeds size limit');chunks.push(Buffer.from(chunk));}
    return Buffer.concat(chunks,length);
  }
  fail('Too many release redirects');
}

async function optionalJson(filename){try{return JSON.parse(await fs.readFile(filename,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function prepareWebsiteFeed({directory,tag,token,repository}) {
  if(repository!==RELEASE_REPOSITORY)fail('This updater workflow is bound to '+RELEASE_REPOSITORY);
  if(!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag))fail('Use an exact stable vX.Y.Z release tag');
  const release=JSON.parse((await boundedFetch(`https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`,{limit:512*1024,apiToken:token})).toString('utf8'));
  const assets=releaseAssets(release,tag);
  const installer=await boundedFetch(assets[assetName].browser_download_url,{limit:128*1024*1024,artifact:true});
  if(installer.length<64||!installer.subarray(0,2).equals(Buffer.from('MZ')))fail('Release Setup is not a bounded PE installer');
  const signature=(await boundedFetch(assets[assetName+'.sig'].browser_download_url,{limit:16*1024,artifact:true})).toString('utf8').trim();
  const uploadedFeed=assets['stable.json']?JSON.parse((await boundedFetch(assets['stable.json'].browser_download_url,{limit:128*1024,artifact:true})).toString('utf8')):undefined;
  const currentConfig=JSON.parse(await fs.readFile(path.join(directory,'config.json'),'utf8'));
  const currentFeed=await optionalJson(path.join(directory,'updates/stable.json'));
  const publicKey=await fs.readFile(path.join(directory,'updates/public-key.txt'),'utf8');
  const result=buildVerifiedFeed({release,requestedTag:tag,installer,signature,publicKey,currentConfig,currentFeed,uploadedFeed});
  if(result.changed){
    await fs.mkdir(path.join(directory,'updates'),{recursive:true});
    await fs.writeFile(path.join(directory,'updates/stable.json'),JSON.stringify(result.feed,null,2)+'\n');
    await fs.writeFile(path.join(directory,'config.json'),JSON.stringify(result.config,null,2)+'\n');
  }
  return {version:result.feed.version,changed:result.changed,sha256:result.feed.platforms['windows-x86_64'].sha256,bytes:result.feed.platforms['windows-x86_64'].bytes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await prepareWebsiteFeed({directory:process.cwd(),tag:process.env.RELEASE_TAG,token:process.env.GITHUB_TOKEN,repository:process.env.GITHUB_REPOSITORY}),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
