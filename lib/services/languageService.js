const fs = require('fs');
const path = require('path');

class LanguageService {
  constructor() {
    this.locales = {};
    this.loadLocales();
  }

  loadLocales() {
    try {
      const localesPath = path.join(__dirname, '../../locales');
      const files = fs.readdirSync(localesPath);
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const lang = file.replace('.json', '');
          const filePath = path.join(localesPath, file);
          this.locales[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      });
    } catch (error) {
      console.error('Error loading locales:', error);
    }
  }

  getText(lang, key, variables = {}) {
    const keys = key.split('.');
    let value = this.locales[lang] || this.locales['en'];
    
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) {
        value = this.locales['en'];
        for (const k2 of keys) value = value?.[k2];
        break;
      }
    }
    
    if (typeof value === 'string' && variables) {
      Object.keys(variables).forEach(variable => {
        value = value.replace(`{${variable}}`, variables[variable]);
      });
    }
    
    return value || key;
  }
}

module.exports = new LanguageService();
