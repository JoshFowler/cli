// @remove-file-on-eject
const path = require('path');
const babel = require('@babel/core');
const chalk = require('chalk');
const fs = require('fs-extra');
const less = require('less');
const LessPluginResolve = require('less-plugin-npm-import');
const minimist = require('minimist');
const LessPluginRi = require('resolution-independence');
const {optionParser: app} = require('@enact/dev-utils');

const blacklist = ['node_modules', 'build', 'dist', '.git', '.gitignore'];
const babelrc = path.join(__dirname, '..', 'config', '.babelrc.js');
const babelRename = {original: '^(.+?)\\.less$', replacement: '$1.css'};
const babelPlugins = [
	require.resolve('@babel/plugin-transform-modules-commonjs'),
	[require.resolve('babel-plugin-transform-rename-import'), babelRename]
];
// Temporary until PLAT-72711, hardcode expected libraries to 24px base size
const ri24 = ['@enact/ui', '@enact/moonstone', '@enact/spotlight', '@enact/agate'];
const lessPlugins = [
	new LessPluginResolve({prefix: '~'}),
	new LessPluginRi(ri24.includes(app.name) ? {baseSize: 24} : app.ri)
];

function displayHelp() {
	console.log('  Usage');
	console.log('    enact transpile [options]');
	console.log();
	console.log('  Options');
	console.log('    -i, --ignore      Pattern of filepaths to ignore');
	console.log('    -o, --output      Directory to transpile to');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function transpile(src, dest) {
	return new Promise((resolve, reject) => {
		babel.transformFile(src, {extends: babelrc, plugins: babelPlugins}, (err, result) => {
			if (err) {
				reject(err);
			} else {
				resolve(result);
			}
		});
	}).then(result => fs.writeFile(dest, result.code, {encoding: 'utf8'}));
}

function lessc(src, dest) {
	return less
		.render(fs.readFileSync(src, {encoding: 'utf8'}), {
			rewriteUrls: 'off',
			paths: [path.dirname(src)],
			plugins: lessPlugins
		})
		.then(result => fs.writeFileSync(dest.replace(/\.less$/, '.css'), result.css, {encoding: 'utf8'}));
}

function api({source = '.', output = './build', ignore} = {}) {
	process.env.ES5 = 'true';
	const filter = (src, dest) => {
		if (ignore && ignore.test && ignore.test(src)) {
			return false;
		} else if (/\.(js|js|ts|tsx)$/i.test(src)) {
			return fs.ensureDir(path.dirname(dest)).then(() => transpile(src, dest));
		} else if (/\.(less|css)$/i.test(src) && !/^[.\\/]*styles[\\/]+/i.test(src)) {
			return fs.ensureDir(path.dirname(dest)).then(() => lessc(src, dest));
		} else {
			return true;
		}
	};

	return fs.readdir(source).then(paths => {
		paths = paths.filter(p => !blacklist.includes(p));
		return Promise.all(
			paths.map(item => {
				return fs.copy(path.join(source, item), path.join(output, item), {filter, stopOnErr: true});
			})
		);
	});
}

function cli(args) {
	const opts = minimist(args, {
		string: ['output', 'ignore'],
		boolean: ['help'],
		default: {output: './build'},
		alias: {i: 'ignore', o: 'output', h: 'help'}
	});
	if (opts.help) displayHelp();

	const ignore = opts.ignore ? new RegExp(opts.ignore) : false;
	process.chdir(app.context);
	console.log('Transpiling via Babel to ' + path.resolve(opts.output));

	api({source: '.', output: opts.output, ignore}).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
	});
}

module.exports = {api, cli};
