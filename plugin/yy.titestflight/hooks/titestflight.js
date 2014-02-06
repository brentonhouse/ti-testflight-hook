var _ = require("underscore"),
    fs = require("fs"),
    afs = require("node-appc").fs,
    path = require("path"),
    Form = require("form-data"),
    fields = require("fields");

exports.cliVersion = '>=3.2';
var logger;
exports.init = function (_logger, config, cli, appc) {
  if (process.argv.indexOf('--test-flight') !== -1 || process.argv.indexOf('--testflight') !== -1) {
    cli.addHook('build.finalize', doTestFlight); 
  }
  logger = _logger;
}

function doTestFlight(data, finished) {
  
  if (data.buildManifest.outputDir === undefined) {
    logger.error("Output directory must be defined to use --testflight flag");
    finished();
    return;
  }

  if (['android', 'ios'].indexOf(data.cli.argv.platform) === -1) {
    logger.error("Only android and ios support with --testflight flag");
    finished();
    return;
  }

  var keys = _.keys(data.tiapp.properties).filter(function(e) { return e.match("^testflight\.");});
  var tf = {};
  keys.forEach(function(k) {
    tf[k.replace(/^testflight\./,'')] = data.tiapp.properties[k].value;
  });
  if (tf.api_token === undefined) {
    logger.error("testflight.api_token is missing.");
    finished();
    return;
  } 
  if (tf.team_token === undefined) {
    logger.error("testflight.team_token is missing.");
    finished();
    return;
  } 
  tf = _.pick(tf, 'api_token','team_token', 'notify', 'distribution_lists');
  var f = {
    notes: fields.text({
      title: "Release Notes",
      desc: "Enter released notes. Required.",
      validate: function(value,callback) {
        callback(!value.length, value);
      }
    })
  };
  if (tf.notify === undefined) {
    f.notify= fields.select({
      title: "Notify",
      desc: "Notify list on upload",
      promptLabel:"(y,n)",
      options: ['__y__es','__n__o'],
    });
  } 
  if (tf.distribution_lists === undefined) {
    f.distribution_lists = fields.text({
      title: "Distribution Lists",
      desc: "Enter a comma separated list (or leave empty)"
    })
  }
  var prompt = fields.set(f);

  prompt.prompt(function(err, result) {
    var form = new Form();
    tf.notes = result.notes;
    if (result.distribution_lists && result.distribution_lists != "") {
      tf.distribution_lists = result.distribution_lists
    }
    if (result.notify !== undefined) {
      tf.notify = result.notify === "yes" ? "True" : "False";
    } else {
      tf.notify = tf.notify ? "True" : "False";
    }

    _.keys(tf).forEach(function(k) {
      form.append(k, tf[k]);
    });
    var build_file =afs.resolvePath(path.join(data.buildManifest.outputDir, data.buildManifest.name + "." + (data.cli.argv.platform === "android" ? "apk" : "ipa")));
    form.append('file', fs.createReadStream(build_file));
   
    logger.info("Uploading...");
    form.submit("http://testflightapp.com/api/builds.json", function(err, res) {
      if (err) {
        logger.error(err);
      } else {
        logger.info("Uploaded successfully.")
      }
      finished();
    }); 
  });
};
