const fs = require('fs');
const path = require('path');

const ideDir = 'C:/Users/lrtra/AppData/Local/Programs/Antigravity IDE/resources/app/out/vs';
const extHostFile = path.join(ideDir, 'workbench/api/node/extensionHostProcess.js');

function patchExtHost() {
    console.log('Patching extensionHostProcess.js...');
    let content = fs.readFileSync(extHostFile, 'utf8');
    
    // We are looking for: alwaysShow:d.alwaysShow,tooltip:Oe.fromStrict(d.tooltip),resourceUri:d.resourceUri
    const regex = /alwaysShow:([a-zA-Z0-9_$]+)\.alwaysShow,tooltip:([a-zA-Z0-9_$]+)\.fromStrict\(\1\.tooltip\),resourceUri:\1\.resourceUri/g;
    
    if (content.match(regex)) {
        console.log('Found target in ExtHost.');
        content = content.replace(regex, (match, dVar, tooltipVar) => {
            console.log('Injecting highlights bypass...');
            return `${match},highlights:${dVar}.highlights`;
        });
        fs.writeFileSync(extHostFile, content, 'utf8');
        console.log('ExtHost patched successfully!');
    } else {
        if (content.includes('highlights:')) {
            console.log('ExtHost might already be patched.');
        } else {
            console.log('Could not find ExtHost target.');
        }
    }
}

patchExtHost();
console.log('Done!');
