// functions/templateEngine.js
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const MarkdownIt = require('markdown-it');
const { isDevEnvironment, formatDate, pool } = require('./utils');

// Cache for compiled templates
const templateCache = {};

const TEMPLATES_DIR = path.join(__dirname, '_templates'); 

// Initialize markdown-it with same options as article compose
const md = new MarkdownIt({
  html: false,        // Disable HTML tags in source
  breaks: true,       // Convert '\n' in paragraphs into <br>
  linkify: true,      // Autoconvert URL-like text to links
  typographer: true   // Enable some language-neutral replacement + quotes beautification
});

// Skip cache if we're in local development mode
const isDev = isDevEnvironment();

/**
 * Load and compile a template
 * @param {string} templateName - The name of the template file (without extension)
 * @returns {Function} Compiled Handlebars template
 */
function getTemplate(templateName) {
  
  // Check if template is already in cache (unless in dev mode)
  if (!isDev && templateCache[templateName]) {
    return templateCache[templateName];
  }

  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);
  
  try {
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const compiledTemplate = Handlebars.compile(templateSource);
    
    // Save in cache for future use
    templateCache[templateName] = compiledTemplate;
    
    return compiledTemplate;
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error);
    throw error;
  }
}

/**
 * Render a template with data
 * @param {string} templateName - The name of the template file (without extension)
 * @param {Object} data - Data to pass to the template
 * @returns {string} Rendered HTML
 */
function render(templateName, data = {}) {
  const template = getTemplate(templateName);
  return template(data);
}

/**
 * Register a partial template
 * @param {string} name - Name of the partial
 * @param {string} templateName - Template file name (without extension)
 */
function registerPartial(name, templateName) {
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);
  
  try {
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    Handlebars.registerPartial(name, templateSource);
  } catch (error) {
    console.error(`Error registering partial ${name}:`, error);
    throw error;
  }
}

/**
 * Register helper functions for use in templates.
 */

Handlebars.registerHelper('permalink', function(post) {
  if (!post || !post.id) return '/';
  
  if (post.slug) {
    return `/p/${post.slug}-${post.id}`;
  }
  
  return `/p/${post.id}`;
});

Handlebars.registerHelper('add', function(a, b) {
  return a + b;
});

Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

Handlebars.registerHelper('neq', function (a, b, options) {
  if (typeof options === 'object' && typeof options.fn === 'function') {
    return a != b ? options.fn(this) : options.inverse(this);
  }
  // fallback for inline use: just return boolean
  return a != b;
});

Handlebars.registerHelper('markdownToHtml', function(content) {
   return content ? md.render(content) : '';
 });
 
Handlebars.registerHelper('substring', function(str, start, end) {
  return str ? str.substring(start, end) : '';
});

Handlebars.registerHelper('gt', function(a, b) {
  return a > b;
});

Handlebars.registerHelper('json', function(context) {
  return JSON.stringify(context);
});

Handlebars.registerHelper('markdownToHtml', function(content) {
  return content ? md.render(content) : '';
});

Handlebars.registerHelper('formatDate', function(dateStr, style) {
  // Handle both single argument (dateStr) and two arguments (dateStr, style)
  if (typeof style === 'object') {
    // If style is the Handlebars options object, use default style
    return formatDate(dateStr);
  }
  
  return formatDate(dateStr, style);
});

// QOTD feature

let allQuotes = [];
async function loadAllQuotes() {
  try {
    const result = await pool.query('SELECT * FROM qotd');
    allQuotes = result.rows;
  } catch (error) {
    console.error('Error loading quotes:', error);
  }
}
loadAllQuotes();

Handlebars.registerHelper('getDomain', function(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch (e) {
    // If URL parsing fails, return the original URL
    return url;
  }
});

Handlebars.registerHelper('getQotd', function(options) {
  try {
    if (allQuotes.length === 0) {
      return options.inverse(this);
    }
    
    // Get a random quote
    const randomIndex = Math.floor(Math.random() * allQuotes.length);
    const randomQuote = allQuotes[randomIndex];
    
    // Return the template with the quote as context
    return options.fn(randomQuote);
  } catch (error) {
    console.error('Error in getQotd helper:', error);
    return options.inverse(this);
  }
});

// pre-register common snippets available to all
registerPartial('footer', 'footer'); 
registerPartial('email-digest', 'email-digest');
registerPartial('profile-header', 'profile-header');
registerPartial('post-card', 'post-card');
registerPartial('post-article', 'post-article');
registerPartial('subscription-form', 'subscription-form');

module.exports = {
  render,
  registerPartial,
  getTemplate
};
