const path = require('path');
const { filterFilePickerItems } = require('./src/filePicker');

const files = [
    'c:\\Users\\lrtra\\Downloads\\plugins\\click-to-chat-for-whatsapp\\package.json',
    'c:\\Users\\lrtra\\Downloads\\plugins\\click-to-chat-for-whatsapp\\package-lock.json',
    'c:\\Users\\lrtra\\Downloads\\plugins\\click-to-chat-for-whatsapp\\webpack.config.js',
    'c:\\Users\\lrtra\\Downloads\\plugins\\click-to-chat-for-whatsapp\\new\\admin2\\assets\\dev\\js\\modules\\components\\layouts\\BlockGridSelect.js',
    'c:\\Users\\lrtra\\Downloads\\plugins\\click-to-chat-for-whatsapp\\new\\admin2\\assets\\dev\\js\\modules\\components\\layouts\\BlockGroup.js',
    'c:\\Users\\lrtra\\Downloads\\plugins\\click-to-chat-for-whatsapp\\new\\admin2\\assets\\dev\\js\\modules\\components\\layouts\\BlockUploadImage.js',
    'c:\\Users\\lrtra\\Downloads\\plugins\\click-to-chat-for-whatsapp\\dev\\docs\\content-blocks-design-analysis.md'
];

// Convert to the format expected by filterFilePickerItems
const allItems = files.map(file => {
    return {
        file: file,
        basename: path.basename(file),
        displayDirectory: path.dirname(file).replace('c:\\Users\\lrtra\\Downloads\\plugins\\', '')
    };
});

// Map it to pickItem format
const pickItems = allItems.map(item => ({
    label: item.basename,
    description: item.displayDirectory,
    alwaysShow: true,
    file: item.file,
    basename: item.basename,
    displayDirectory: item.displayDirectory
}));

const query = 'a 2/dv/j/';
const maxResults = 10;

console.log(`Searching for '${query}'...`);
const visibleItems = filterFilePickerItems(pickItems, query, maxResults);

visibleItems.forEach((item, index) => {
    console.log(`\n--- Result ${index + 1} ---`);
    console.log(`File: ${item.file}`);
    console.log(`Label: ${item.label}`);
    console.log(`Description: ${item.description}`);
    console.log(`Highlights: ${JSON.stringify(item.highlights)}`);
});
