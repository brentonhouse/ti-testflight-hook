var _ = require("underscore"),
    fs = require("fs"),
    afs = require("node-appc").fs,
    path = require("path"),
    Form = require("form-data"),
    archiver = require('archiver'),
    mktemp = require('mktemp'),
    editor = require('editor'),
    fields = require("fields");

exports.cliVersion = '>=3.2';
var logger, form, platform, config, alloyConfig;
exports.init = function (_logger, config, cli, appc) {
    if (process.argv.indexOf('--test-flight') !== -1 || process.argv.indexOf('--testflight') !== -1) {
        cli.addHook('build.pre.compile', configure);
        cli.addHook('build.finalize', doTestFlight);
    }
	alloyConfig = config;
    logger = _logger;
}

function configure(data, finished) {
    
    /* 
   *  configuration/error checking
   */
  platform = data.cli.argv.platform;
    
    if (data.buildManifest.outputDir === undefined && data.iosBuildDir === undefined) {
        logger.error("Output directory must be defined to use --testflight flag");
        return;
    }
    if (['android', 'ios'].indexOf(platform) === -1) {
        logger.error("Only android and ios support with --testflight flag");
        return;
    }
    
    var keys = _.keys(data.tiapp.properties).filter(function (e) { return e.match("^testflight\."); });
    config = {};
    keys.forEach(function (k) {
        config[k.replace(/^testflight\./, '')] = data.tiapp.properties[k].value;
    });
    if (config.api_token === undefined) {
        logger.error("testflight.api_token is missing.");
        return;
    }
    if (config.team_token === undefined) {
        logger.error("testflight.team_token is missing.");
        return;
    }
    
    if (config.release_notes_file === undefined) {
        if (config.release_notes === undefined) {
            
            logger.error("testflight.release_notes is missing.");
            return;
        }
    } else {
        
        var release_notes_path = afs.resolvePath(path.join(alloyConfig.dir.project), config.release_notes_file);
        if (fs.existsSync(release_notes_path)) {
            tf.notes = fs.readFileSync(release_notes_path);
            fs.unlink(release_notes_path);
        } else if (tf.release_notes) {
            logger.warn('Release note file not found (' + release_notes_path + ')');
            tf.notes = tf.release_notes;
        } else {
            logger.error("testflight.release_notes is missing.");
            logger.error('Release note file not found (' + release_notes_path + ')');
            return;
        }


    }
    
     finished();
    
    //if (config.notes === undefined) {
    //    var tmpFile = mktemp.createFileSync('XXXXXXXXXXX');
    //    editor(tmpFile, function (code, sig) {
    //        config.notes = fs.readFileSync(tmpFile).toString();
    //        doPrompt(data, finished);
    //    });
    //} else {
        
    //    finished();
    //}
  

}

//function doPrompt(data, callback) {
//    config = _.pick(config, 'api_token', 'team_token', 'notify', 'distribution_lists', 'dsym', 'release_notes', 'release_notes_file');
//    var f = {};
//    var release_notes_path = afs.resolvePath(path.join(data.buildManifest.outputDir), '' + tf.release_notes_file);
    
//    if (fs.existsSync(release_notes_path)) {
//        tf.notes = fs.readFileSync(release_notes_path);
//        fs.unlink(release_notes_path);
//    } else {
//        logger.error('Release note file not found (' + release_notes_path + ')');
//    }
    
    
//    if (_.isEmpty(tf.notes)) {
//        f.notes = fields.text({
//            title: "Release Notes",
//            desc: "Enter release notes (required)",
//            validate: function (value, callback) {
//                callback(!value.length, value);
//            }
//        });
//    }
    
//    if (config.notify === undefined) {
//        f.notify = fields.select({
//            title: "Notify",
//            desc: "Notify list on upload",
//            promptLabel: "(y,n)",
//            options: ['__y__es', '__n__o'],
//        });
//    }
    
//    if (config.distribution_lists === undefined) {
//        f.distribution_lists = fields.text({
//            title: "Distribution Lists",
//            desc: "Enter a comma separated list (or leave empty)"
//        })
//    }
//    if ('ios' === data.cli.argv.platform && config.dsym === undefined) {
//        f.dsym = fields.select({
//            title: "dSYM",
//            desc: "Send dSYM",
//            promptLabel: "(y,n)",
//            options: ['__y__es', '__n__o'],
//        });
//    }
//    var prompt = fields.set(f);
//    prompt.prompt(function (err, result) {
//        form = new Form();
//        if (_.isEmpty(tf.notes)) {
//            tf.notes = result.notes;
//        } else {
//            logger.info("Release notes file found");
//        }
        
//        if (result.distribution_lists && result.distribution_lists != "") {
//            config.distribution_lists = result.distribution_lists
//        }
//        if (result.notify !== undefined) {
//            config.notify = result.notify === "yes" ? "True" : "False";
//        } else {
//            config.notify = config.notify ? "True" : "False";
//        }
//        if (result.dsym === "yes") {
//            config.dsym = true;
//        }
//        _.keys(config).forEach(function (k) {
//            if (k !== 'dsym') {
//                form.append(k, config[k]);
//            }
//        });
//        callback();
//    });
//}

function doTestFlight(data, finished) {
    
    if (_.isUndefined(form)) {
        form = new Form();
        _.keys(config).forEach(function (k) {
            if (k !== 'dsym') {
                form.append(k, config[k]);
            }
        });
    }
    
    var build_file = afs.resolvePath(path.join(data.buildManifest.outputDir, data.buildManifest.name + "." + (data.cli.argv.platform === "android" ? "apk" : "ipa")));
    
    form.append('file', fs.createReadStream(build_file));
    
    var dsym_path = path.join(data.cli.argv["project-dir"], 'build', 'iphone', 'build', 'Release-iphoneos', data.buildManifest.name + ".app.dSYM");
    if (config.dsym === true && fs.existsSync(dsym_path)) {
        logger.info("dSYM found");
        var dsym_zip = dsym_path + ".zip";
        var output = fs.createWriteStream(dsym_zip);
        var archive = archiver('zip');
        output.on('close', function () {
            logger.info("dSYM zipped");
            form.append('dsym', fs.createReadStream(dsym_zip));
            submit(form, finished);
        });
        archive.on('error', function (err) { throw err; });
        archive.pipe(output);
        archive.bulk([{ expand: true, cwd: dsym_path, src: ['**'] }]);
        archive.finalize();
    } else {
        submit(form, finished);
    }



};

function submit(form, callback) {
    logger.info("Uploading...");
    form.submit("http://testflightapp.com/api/builds.json", function (err, res) {
        if (err) {
            logger.error(err);
        } else {
            logger.info("Uploaded successfully.")
        }
        callback();
    });
}
