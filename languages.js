// Match the five languages shipped by the desktop application.
export const languages = [
  {id: 'en', name: 'English', dir: 'ltr'},
  {id: 'ar', name: 'العربية', dir: 'rtl'},
  {id: 'de', name: 'Deutsch', dir: 'ltr'},
  {id: 'fr', name: 'Français', dir: 'ltr'},
  {id: 'it', name: 'Italiano', dir: 'ltr'},
];

export const isLanguage = id => languages.some(language => language.id === id);
