const fs = require('fs');
const path = require('path');
const { filterFilePickerItems } = require('./src/filePicker');

const files = fs.readFileSync('files_list.txt', 'utf8').split('\n').filter(Boolean).map(line => line.trim());

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

const query = 'pkgs';
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
