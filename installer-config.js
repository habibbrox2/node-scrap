// Configuration for electron-builder
module.exports = {
    appId: 'com.broxscraper.app',
    productName: 'Brox Scraper',
    files: [
        'index.js',
        'electron-main.js',
        'preload.js',
        'package.json',
        'src/**/*',
        'public/**/*',
        'cache/**/*',
        'node_modules/**/*',
    ],
    directories: {
        output: 'dist',
        buildResources: 'assets',
    },
    win: {
        target: [
            {
                target: 'nsis',
                arch: ['x64'],
            },
            {
                target: 'portable',
                arch: ['x64'],
            },
        ],
        icon: 'assets/icon.png',
    },
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Brox Scraper',
        include: 'build/installer.nsh',
    },
    portable: {
        artifactName: '${productName}-${version}-portable.exe',
    },
};
