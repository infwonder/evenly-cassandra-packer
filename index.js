/*
Copyright 2017  University Corporation for Atmospheric Research 

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';
const protobuf = require("protocol-buffers");
const C = require('crypto');
const fs = require('fs');
const os = require('os');
const lupus = require('lupus');

module.exports = 
{
  protofile: __dirname + '/ecp.proto',
  metadir: undefined,
  datadir: undefined,
  outdir:  undefined,
  schemas: undefined,
  cfgobj: undefined,
  watchman: undefined,
  pbsq: [],
  deleteSrc: true,
  triggerName: '__WATCH_TRIGGER__',
  triggerTime: 1001,
  triggerInst: undefined,
  maxsize: 524288,

  load_schemas: function () 
  {
    var path = module.exports.protofile;
    module.exports.schemas = protobuf(fs.readFileSync(path));
  }, // synced function

  __std_trigger_action: function(path) 
  {
    fs.closeSync(fs.openSync(path + '/' + module.exports.triggerName, 'w'));
  },

  __trigger: function(path) 
  {
    module.exports.triggerInst = setInterval(() => { module.exports.__std_trigger_action(path); }, module.exports.triggerTime);
  },

  watcher: function (path, callback)
  {                                                    
    /* 
       The callback should update module.exports.pbsq (fs.watch queue) after adding files in the list into pb.
       Here, we should use the same watcher to trigger the time out wrap up! (the watcher will be persistant)
       by update (full rewrite) a specially named file (__WATCH_TRIGGER__) in path,
       it will trigger a 'change' event type on the specially named file,
       which can be used as an indicator of time's up, and start converting file 
       to pb and reset watcher. (note, not close it)
       In the case that the maxsize is reached, the watcher simply delete the trigger file to reset timer. 
       New timer is set again when there's any new file comes in after the reset. Thus start over again...
       
       By using same watcher for both size trigger and time trigger, we can avoid the race condition.
    */
    var totalsize = 0;                                
    var filelist  = [];
    // start trggier first ...
    module.exports.__trigger(path, module.exports.__std_trigger_action);
                           
    // path should be a folder                        
    module.exports.watchman = fs.watch(path, (e, f) =>
    {                                                  
      var error = null;

      if (e == 'rename' && f != module.exports.triggerName && fs.existsSync(path + '/' + f) && filelist.indexOf(path + '/' + f) == -1 && f[0] != '.') {
        var stats = fs.statSync(path + '/' + f);
        totalsize = totalsize + stats.size;
        filelist.push(path + '/' + f);
        console.log('! Adding ' + path + '/' + f + ' (' + e + ') totalsize: ' + totalsize);

        if (totalsize >= module.exports.maxsize) { 
          callback(error, totalsize, filelist);
          totalsize = 0; filelist = [];
        }
      } else if (e == 'change' && f == module.exports.triggerName) {
        console.log('-- DEBUG: trigger executed: ' + path + '/' + f + ' (' + e + ')');
        // trigger executed, reset watcher stats
        var ts = totalsize; totalsize = 0;
        var fl = filelist;  filelist  = [];
        if (ts != 0 && fl.length != 0) callback(error, ts, fl);
      } else {
        console.log('-- DEBUG: fs.watcher got a ' + e + ' on ' + f);
      }
    });

    module.exports.watchman.on('error', (err) => { 
      try {
        clearInterval(module.exports.triggerInst);
      } catch(err) {
        console.log("Failed to stop trigger:" + err);
      }
      return callback(err, null, null); 
    });
  },

  /* If we can remove the need to use protobuf, we will... The test will begin by directly link watcher with evenly-cassandra on workers 
  new_packet: function (path, totalsize, filelist, callback) {},
  get_header: function (path, callback) {},
  unpackit:  function (path, delpkg, callback) {}, // delpkg is bool.
  repackit:  function (header_obj, delsrc, callback) {} // delsrc is bool.
  // more ... */
};
