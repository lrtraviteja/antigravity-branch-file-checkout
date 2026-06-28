const fs = require('fs');
const path = require('path');

const ideDir = 'C:/Users/lrtra/AppData/Local/Programs/Antigravity IDE/resources/app/out/vs';
const extHostFile = path.join(ideDir, 'workbench/api/node/extensionHostProcess.js');
const mainFile = path.join(ideDir, 'workbench/workbench.desktop.main.js');

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

function patchMainProcess() {
    console.log('Patching workbench.desktop.main.js...');
    let content = fs.readFileSync(mainFile, 'utf8');
    
    const target = 'if(s||o||a?(r.labelHighlights=s,r.descriptionHighlights=o,r.detailHighlights=a,r.hidden=!1):(r.labelHighlights=void 0,r.descriptionHighlights=void 0,r.detailHighlights=void 0,r.hidden=r.item?!r.item.alwaysShow:!0)';
    const replacement = 'if(s||o||a?(r.labelHighlights=r.item?.highlights?.label??s,r.descriptionHighlights=r.item?.highlights?.description??o,r.detailHighlights=r.item?.highlights?.detail??a,r.hidden=!1):(r.labelHighlights=r.item?.highlights?.label,r.descriptionHighlights=r.item?.highlights?.description,r.detailHighlights=r.item?.highlights?.detail,r.hidden=r.item?!r.item.alwaysShow:!0)';
    
    if (content.includes(target)) {
        console.log('Found target in MainProcess.');
        content = content.replace(target, replacement);
        fs.writeFileSync(mainFile, content, 'utf8');
        console.log('MainProcess patched successfully!');
    } else {
        if (content.includes('r.item?.highlights?.label')) {
            console.log('MainProcess might already be patched.');
        } else {
            console.log('Could not find MainProcess target.');
        }
    }
}

patchExtHost();
patchMainProcess();
console.log('Done!');

