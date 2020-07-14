// @remove-file-on-eject
/**
 * Original work Copyright (c) 2015-present, Facebook, Inc.
 * Modified work Copyright (c) 2019, TB Digital Services GmbH
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
    throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

function isInGitRepository() {
    try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

function isInMercurialRepository() {
    try {
        execSync('hg --cwd . root', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

function tryGitInit() {
    try {
        execSync('git --version', { stdio: 'ignore' });
        if (isInGitRepository() || isInMercurialRepository()) {
            return false;
        }

        execSync('git init', { stdio: 'ignore' });
        return true;
    } catch (e) {
        console.warn('Git repo not initialized', e);
        return false;
    }
}

function tryGitCommit(appPath) {
    try {
        execSync('git add -A', { stdio: 'ignore' });
        execSync('git commit -m "Initialize project using Create React App"', {
            stdio: 'ignore',
        });
        return true;
    } catch (e) {
        // We couldn't commit in already initialized git repo,
        // maybe the commit author config is not set.
        // In the future, we might supply our own committer
        // like Ember CLI does, but for now, let's just
        // remove the Git files to avoid a half-done state.
        console.warn('Git commit not created', e);
        console.warn('Removing .git directory...');
        try {
            // unlinkSync() doesn't work on directories.
            fs.removeSync(path.join(appPath, '.git'));
        } catch (removeErr) {
            // Ignore.
        }
        return false;
    }
}

module.exports = function(appPath, appName, verbose, originalDirectory, templateName) {
    const appPackage = require(path.join(appPath, 'package.json'));
    const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

    if (!templateName) {
        console.log('');
        console.error(
            `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan(
                'create-react-app'
            )}.`
        );
        console.error(`Please note that global installs of ${chalk.cyan('create-react-app')} are no longer supported.`);
        return;
    }

    const templatePath = path.join(require.resolve(templateName, { paths: [appPath] }), '..');

    let templateJsonPath;
    if (templateName) {
        templateJsonPath = path.join(templatePath, 'template.json');
    } else {
        // TODO: Remove support for this in v4.
        templateJsonPath = path.join(appPath, '.template.dependencies.json');
    }

    let templateJson = {};
    if (fs.existsSync(templateJsonPath)) {
        templateJson = require(templateJsonPath);
    }

    const templatePackage = templateJson.package || {};

    // Keys to ignore in templatePackage
    const templatePackageBlacklist = [
        'name',
        'version',
        'description',
        'keywords',
        'bugs',
        'license',
        'author',
        'contributors',
        'files',
        'browser',
        'bin',
        'man',
        'directories',
        'repository',
        'peerDependencies',
        'bundledDependencies',
        'optionalDependencies',
        'engineStrict',
        'os',
        'cpu',
        'preferGlobal',
        'private',
        'publishConfig',
    ];

    // Keys from templatePackage that will be merged with appPackage
    const templatePackageToMerge = ['dependencies', 'scripts'];

    // Keys from templatePackage that will be added to appPackage,
    // replacing any existing entries.
    const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
        return !templatePackageBlacklist.includes(key) && !templatePackageToMerge.includes(key);
    });

    // Copy over some of the devDependencies
    appPackage.dependencies = appPackage.dependencies || {};

    // Setup the script rules
    // TODO: deprecate 'scripts' key directly on templateJson
    const templateScripts = templatePackage.scripts || templateJson.scripts || {};
    appPackage.scripts = Object.assign(
        {
            start: 'react-scripts start',
            build: 'react-scripts build',
            test: 'react-scripts test',
            eject: 'react-scripts eject',
        },
        templateScripts
    );

    // Update scripts for Yarn users
    if (useYarn) {
        appPackage.scripts = Object.entries(appPackage.scripts).reduce(
            (acc, [key, value]) => ({
                ...acc,
                [key]: value.replace(/(npm run |npm )/, 'yarn '),
            }),
            {}
        );
    }

    // Setup the eslint config
    appPackage.eslintConfig = {
        extends: 'react-app',
    };

    // Setup the browsers list
    appPackage.browserslist = getRioBrowserList();

    // Add templatePackage keys/values to appPackage, replacing existing entries
    templatePackageToReplace.forEach(key => {
        appPackage[key] = templatePackage[key];
    });

    fs.writeFileSync(path.join(appPath, 'package.json'), JSON.stringify(appPackage, null, 2) + os.EOL);

    const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
    if (readmeExists) {
        fs.renameSync(path.join(appPath, 'README.md'), path.join(appPath, 'README.old.md'));
    }

    // Copy the files for the user
    const templateDir = path.join(templatePath, 'template');
    if (fs.existsSync(templateDir)) {
        fs.copySync(templateDir, appPath);
    } else {
        console.error(`Could not locate supplied template: ${chalk.green(templateDir)}`);
        return;
    }

    // modifies README.md commands based on user used package manager.
    if (useYarn) {
        try {
            const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
            fs.writeFileSync(path.join(appPath, 'README.md'), readme.replace(/(npm run |npm )/g, 'yarn '), 'utf8');
        } catch (err) {
            // Silencing the error. As it fall backs to using default npm commands.
        }
    }

    const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
    if (gitignoreExists) {
        // Append if there's already a `.gitignore` file there
        const data = fs.readFileSync(path.join(appPath, 'gitignore'));
        fs.appendFileSync(path.join(appPath, '.gitignore'), data);
        fs.unlinkSync(path.join(appPath, 'gitignore'));
    } else {
        // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
        // See: https://github.com/npm/npm/issues/1862
        fs.moveSync(path.join(appPath, 'gitignore'), path.join(appPath, '.gitignore'), []);
    }

    // Initialize git repo
    let initializedGit = false;

    if (tryGitInit()) {
        initializedGit = true;
        console.log();
        console.log('Initialized a git repository.');
    }

    let command;
    let remove;
    let args;

    if (useYarn) {
        command = 'yarnpkg';
        remove = 'remove';
        args = ['add'];
    } else {
        command = 'npm';
        remove = 'uninstall';
        args = ['install', '--save', verbose && '--verbose'].filter(e => e);
    }

    // Install additional template dependencies, if present
    // TODO: deprecate 'dependencies' key directly on templateJson
    const templateDependencies = templatePackage.dependencies || templateJson.dependencies;
    if (templateDependencies) {
        args = args.concat(
            Object.keys(templateDependencies)
                .filter(key => !getRioExternalDependencies().includes(key))
                .map(key => {
                    return `${key}@${templateDependencies[key]}`;
                })
        );
    }

    // Install react and react-dom for backward compatibility with old CRA cli
    // which doesn't install react and react-dom along with react-scripts
    if (!isReactInstalled(appPackage)) {
        args = args.concat(['react', 'react-dom']);
    }

    // Install template dependencies, and react and react-dom if missing.
    if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
        console.log();
        console.log(`Installing template dependencies using ${command}...`);

        const proc = spawn.sync(command, args, { stdio: 'inherit' });
        if (proc.status !== 0) {
            console.error(`\`${command} ${args.join(' ')}\` failed`);
            return;
        }
    }
    // Final npm install for all additional dev dependencies
    const procStatus = installRioDevDependencies(useYarn, verbose, templatePackage);
    if (procStatus !== 0) {
        return;
    }

    if (args.find(arg => arg.includes('typescript'))) {
        console.log();
        verifyTypeScriptSetup();
    }

    // Remove template
    console.log(`Removing template package using ${command}...`);
    console.log();

    const proc = spawn.sync(command, [remove, templateName], {
        stdio: 'inherit',
    });
    if (proc.status !== 0) {
        console.error(`\`${command} ${args.join(' ')}\` failed`);
        return;
    }

    // Create git commit if git repo was initialized
    if (initializedGit && tryGitCommit(appPath)) {
        console.log();
        console.log('Created git commit.');
    }

    // Display the most elegant way to cd.
    // This needs to handle an undefined originalDirectory for
    // backward compatibility with old global-cli's.
    let cdpath;
    if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
        cdpath = appName;
    } else {
        cdpath = appPath;
    }

    // Change displayed command to yarn instead of yarnpkg
    const displayedCommand = useYarn ? 'yarn' : 'npm';

    console.log();
    console.log(`Success! Created ${appName} at ${appPath}`);
    console.log();
    console.log(chalk.red('RIO starter template'));
    console.log('You are using the RIO starter template which is a fork of the original create-react-app templates');
    console.log();
    console.log('Inside that directory, you can run several commands:');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} start`));
    console.log('    Starts the development server.');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`));
    console.log('    Bundles the app into static files for production.');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} test`));
    console.log('    Starts the test runner.');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`));
    console.log('    Removes this tool and copies build dependencies, configuration files');
    console.log('    and scripts into the app directory. If you do this, you can’t go back!');
    console.log();
    console.log('We suggest that you begin by typing:');
    console.log();
    console.log(chalk.cyan('  cd'), cdpath);
    console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
    if (readmeExists) {
        console.log();
        console.log(chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`'));
    }
    console.log();
    console.log('Happy hacking!');
};

function isReactInstalled(appPackage) {
    const dependencies = appPackage.dependencies || {};

    return typeof dependencies.react !== 'undefined' && typeof dependencies['react-dom'] !== 'undefined';
}

function getRioExternalDependencies() {
    return ['react', 'react-dom'];
}

function installRioDevDependencies(useYarn, verbose, templateJson) {
    let command;
    let args;

    if (useYarn) {
        command = 'yarnpkg';
        args = ['add', '--dev'];
    } else {
        command = 'npm';
        args = ['install', '--save-dev', verbose && '--verbose'].filter(e => e);
    }

    console.log(`Installing additional RIO dev dependencies using ${command}...`);
    console.log();

    // Install additional template dev dependencies, if present
    const templateDevDependencies = templateJson.devDependencies;
    if (templateDevDependencies) {
        args = args.concat(
            Object.keys(templateDevDependencies).map(key => {
                return `${key}@${templateDevDependencies[key]}`;
            })
        );
    }

    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
        console.error(`\`${command} ${args.join(' ')}\` failed`);
    } else {
        if (args.find(arg => arg.includes('typescript'))) {
            console.log();
            verifyTypeScriptSetup();
        }
    }

    return proc.status;
}

function getRioBrowserList() {
    return ['last 2 versions', 'last 5 Chrome versions', 'Firefox >= 60', 'Edge >= 15', 'Safari >= 10', 'IE >= 11'];
}
