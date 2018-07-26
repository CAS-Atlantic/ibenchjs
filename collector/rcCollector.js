const app = require('express')()
	, child_process = require('child_process')
	, execSync = child_process.execSync
	, exec = child_process.exec
	, Promise = require('promise')
	, rl = require('readline')
	, fs = require('fs')
	, SSH = require('simple-ssh');


// docker command
//var list_container_cmd1 = 'docker ps -f status=running -f ancestor='
var list_container_cmd1 = 'docker ps -f status=running '
	list_container_cmd2 = ' --format "{{.ID}}"'
	, list_container_pid = 'docker inspect --format "{{ .State.Pid }} {{.Id}}" ';
	
// remote command execution
var remote_user = 'ubuntu'
	, ubuntu_passd = '12345'
	, mkdir_cmd1 = 'sudo mkdir -p /var/run/netns'
	, ln_cmd1 = 'sudo ln -sf /proc/'
	, ln_cmd2 = '/ns/net /var/run/netns/'
	, ip_netns_cmd1 = 'sudo ip netns exec '
	, ip_netns_cmd2 = ' netstat -ie'
	, cpu_cgroup1 = '/sys/fs/cgroup/cpuacct/docker/'
	, cpu_cgroup2 = '/cpuacct.stat'
	, blkio_cmd1 = ' cat /sys/fs/cgroup/blkio/docker/'
	, blkio_cmd2 = '/blkio.io_service_bytes'
	, blkio_cmd3 = '/blkio.throttle.io_service_bytes'
	, mem_cmd1 = '/sys/fs/cgroup/memory/docker/'
	, mem_cmd2 = '/memory.usage_in_bytes'
	, rss_cmd = 'ps -o rss ';
	
var start = null
	, end = null
	, imgName = process.env.IMAGE;

const hosts_file_path = __dirname + '/hosts.json'
	, metrics_path = __dirname + '/metrics_json.json';

var container_info_obj = {}
	, mem_usage_obj = {}
	, mem_usage_arr = []
	, mem_count = 0
	, rt_metrics = {}
	, host_json_obj = {}
	, container_placement = {};// stroe all resource usgae metrics
	
	
function runRC(){
	var server = app.listen({ host: '0.0.0.0', port: '3000'});
	app.get('/', function(req, res) {
		findCid().then((cids) => {
			findCInfo(cids).then((cinfos) => {
				container_info_obj = cinfos;
				res.status(200).send('OK');				
			});			
		}).catch((err) => {
			res.status(500).send(err.toString());
		});		
	});
	
	app.get('/startperf', (req, res) => {		
		var flag = req.query.flag;
		if(flag == '0'){
			firstCollection(res);
		}else if(flag == '1'){			
			secondCollection(res);
		}
	});
	app.get('/testssh', (req, res) => {
		res.status(200).send('OK');	
	});
}

// establish SSH connection
function buildSSHConn(ssh_ip){
	return new Promise((resolve, reject) => {
		var options = {};
		options.host = ssh_ip;
		options.user = remote_user;
		options.pass = ubuntu_passd;
		var ssh = new SSH(options);
		ssh.on('error', (err) => {
			reject(err.toString());
			ssh.end();
		});
		resolve(ssh);			
	});	
}
// add command to execution queue
function enqueueSSHCmd(ssh, cmd){
	return new Promise((resolve, reject) => {
		//console.log(cmd);
		ssh.exec(cmd.trim(), {
			pty: true,			
			exit: function(code, stdout, stderr){
				if(stderr){
					reject('error: ' + stderr.toString()); 
				}else{
					var stdout_str = stdout.toString().trim();	
					resolve(stdout_str);
				}			
			}
		});		
	});
}
// start to execute command in the queue
function execSSHCmd(ssh){
	return new Promise((resolve, reject) => {
		ssh.start({
			success: function(){
				resolve('OK');
			},
			fail: function(err){
				reject(err.toString());
			}
		});		
	});	
}

// find container ID
function findCidPromise(ssh_ip){
	return new Promise((resolve, reject) => {
		var cid_obj = {};
	var cmd = list_container_cmd1 + list_container_cmd2;	
		buildSSHConn(ssh_ip).then((ssh) => {
			var enqueueSSHPromise = enqueueSSHCmd(ssh, cmd);
			execSSHCmd(ssh).then(() => {
					enqueueSSHPromise.then((raw_cids) => {
					var cids = raw_cids.toString().trim().replace(/\n/g, ';');					
					cid_obj[ssh_ip] = cids;														
					resolve(cid_obj);
				}).catch((err) => {reject(err.toString());});												
			}).catch((err) => {
				reject(err.toString());				
			});			
		}).catch((err) => {reject(err.toString());});
	});
}

function findCid(){
	return new Promise((resolve, reject) => {	
		var findCidPromises = [], pushed = 0;
		host_json_obj = JSON.parse(fs.readFileSync(hosts_file_path, 'utf-8'));
		var ssh_ips = Object.keys(host_json_obj);		
		for(var i = 0; i < ssh_ips.length; i++){
			var ssh_ip = host_json_obj[ssh_ips[i]];		
			findCidPromises.push(findCidPromise(ssh_ip));
			if(++pushed == ssh_ips.length){
				Promise.all(findCidPromises).then((cid_obj) => {
					
					var cid_obj = deleteEmptyContainer(cid_obj);
					resolve(cid_obj);
					
				}).catch((err) => {reject(err.toString());});
			}
		}
	});	
}
/*
cid_obj=
[ { '192.168.1.185': '12277f1692db;5bd877fca259' },
  { '192.168.1.179': '0eca51a9de41;ca9b4a42602f' } ]
*/
function findCInfoPromise(ssh_ip, cids){	
	return new Promise((resolve, reject) => {
		var enqueuePromises = [], cinfo_obj = {}, pushed = 0;
		buildSSHConn(ssh_ip).then((ssh) => {
			for(var i = 0; i < cids.length; i++){				
				var cid = cids[i];
				var cmd = list_container_pid + cid; 
				var enqueueSSHPromise = enqueueSSHCmd(ssh, cmd);
				enqueuePromises.push(enqueueSSHPromise);
				if(++pushed == cids.length){
					execSSHCmd(ssh).then(() => {
						Promise.all(enqueuePromises).then((cinfos) => {
							cinfo_obj[ssh_ip] = cinfos;
							
							resolve(cinfo_obj);												
						});
					}).catch((err) => {
						reject(err.toString());
					});					
				}								
			}		
		});		
	});
}

/*
cinfo_obj=
[{"192.168.1.185":
	["3122 12277f1692dbf93550ca97dd2c989d26174882fd11cbed4111de291ded48043d",
	"2971 5bd877fca259b4571c003dbf4d59964670dea929069f6064edb44b2e2079611a"]},
{"192.168.1.179":
	["3138 0eca51a9de4139032ee5b6993ac2a30113a3e687a3639d62965bcf740577b603",
	"3010 ca9b4a42602fa62f7b85df1db5c372194999f83ca27d667695f31bbf3332bf41"]
}]
*/
function findCInfo(cid_obj){
	return new Promise((resolve, reject) => {
		var findCInfoPromises = [], pushed = 0;
		for(var i = 0; i < cid_obj.length; i++){
			var ele = cid_obj[i];
			var ssh_ip = Object.keys(ele)[0];
			var cids = ele[ssh_ip].split(';');
			var tmp_numOfC = cids.length;
			var hostname = getKeyByValue(host_json_obj, ssh_ip);
			container_placement[hostname] = tmp_numOfC;
			findCInfoPromises.push(findCInfoPromise(ssh_ip, cids));
			if(++pushed == cid_obj.length){
				Promise.all(findCInfoPromises).then((cinfos) => {					
					resolve(cinfos);					
				});
			}
		}		
	});	
}

function getCPUMetricsPromise(ssh_ip, cinfos){
	return new Promise((resolve, reject) => {
		var enqueuePromises = [], cpu_obj = {}, pushed = 0;
		var cid_cpuinfo_arr = [];
		buildSSHConn(ssh_ip).then((ssh) => {			
			for(var i = 0; i < cinfos.length; i++){	
				var cid_cpuinfo = {};
				var cinfo = cinfos[i];
				var cid = cinfo.split(' ')[1];
				var cpu_cgroup_path = cpu_cgroup1 + cid + cpu_cgroup2;
				var cmd = 'cat ' + cpu_cgroup_path;					
				var enqueueSSHPromise = enqueueSSHCmd(ssh, cmd);
				enqueuePromises.push(enqueueSSHPromise);

				if(++pushed == cinfos.length){
					execSSHCmd(ssh).then(() => {
						Promise.all(enqueuePromises).then((cpuinfos) => {
							var cid_cpuinfo_arr = [];
							for(var j = 0; j < cinfos.length; j++){								
								var cid_key = cinfos[j].split(' ')[1].substring(0, 12);
								var cid_cpuinfo = {};
								cid_cpuinfo[cid_key] = cpuinfos[j]; 
								cid_cpuinfo_arr.push(cid_cpuinfo);

							}											
							cpu_obj[ssh_ip] = cid_cpuinfo_arr;							
							resolve(cpu_obj);												
						}).catch((err) => {
							reject(err.toString());
						});
					}).catch((err) => {
						reject(err.toString());
					});					
				}
			}		
		});		
	});
}

//Extract all CPU metrics from different node
/*
Sample output:
[{"192.168.1.40":[{"e34b0bb48d19":"user 1893\r\nsystem 4560"},{"b75eac605256":"user 2432\r\nsystem 1843"}]},
{"192.168.1.41":[{"e7cc5d0a0895":"user 1974\r\nsystem 1972"},{"c034452f3284":"user 1819\r\nsystem 3984"}]},
{"192.168.1.43":[{"fd83179a3bc1":"user 1623\r\nsystem 2207"}]}]
*/
function getCPUMetrics(cinfo_obj){
	return new Promise((resolve, reject) => {
		var getCPUMetricsPromises = [], pushed = 0;
		for(var i = 0; i < cinfo_obj.length; i++){
			var cinfo = cinfo_obj[i];
			var ssh_ip = Object.keys(cinfo)[0];
			var cinfos = cinfo[ssh_ip];				
			getCPUMetricsPromises.push(getCPUMetricsPromise(ssh_ip, cinfos));
			if(++pushed == cinfo_obj.length){
				Promise.all(getCPUMetricsPromises).then((cpuinfos) => {					
					resolve(cpuinfos);														
				}).catch((err) => {
					var err_msg = 'CPU data collection fail...: ' + err.toString();					
					reject(err_msg);
				});
			}
		}
	});
}

function getRSSMetricsPromise(ssh_ip, cinfos){
	return new Promise((resolve, reject) => {
		var enqueuePromises = [], rss_obj = {}, pushed = 0;
		buildSSHConn(ssh_ip).then((ssh) => {
			for(var i = 0; i < cinfos.length; i++){				
				var cinfo = cinfos[i];
				var pid = cinfo.split(' ')[0];			
				var cmd = rss_cmd + pid;			
				var enqueueSSHPromise = enqueueSSHCmd(ssh, cmd);
				enqueuePromises.push(enqueueSSHPromise);
				if(++pushed == cinfos.length){
					execSSHCmd(ssh).then(() => {
						Promise.all(enqueuePromises).then((rssinfos) => {					
							rss_obj[ssh_ip] = rssinfos;
							resolve(rss_obj);												
						}).catch((err) => {
							reject(err.toString());
						});
					}).catch((err) => {
						reject(err.toString());
					});				
				}								
			}		
		});		
	});
}


//Extract all RSS metrics from different node (docker container mode)
function getRSSMetrics(cinfo_obj){
	return new Promise((resolve, reject) => {
		var getRSSMetricsPromises = [], pushed = 0;
		for(var i = 0; i < cinfo_obj.length; i++){
			var cinfo = cinfo_obj[i];
			var ssh_ip = Object.keys(cinfo)[0];
			var cinfos = cinfo[ssh_ip];		
			getRSSMetricsPromises.push(getRSSMetricsPromise(ssh_ip, cinfos));
			if(++pushed == cinfo_obj.length){
				Promise.all(getRSSMetricsPromises).then((rssinfos) => {					
					resolve(rssinfos);					
				}).catch((err) => {
					var err_msg = 'RSS data collection fail...: ' + err.toString();	
					reject(err_msg);
				});
			}
		}		
	});
}

function getDiskMetricsPromise(ssh_ip, cinfos){
	return new Promise((resolve, reject) => {
		var enqueuePromises = [], disk_obj = {}, pushed = 0;
		buildSSHConn(ssh_ip).then((ssh) => {
			for(var i = 0; i < cinfos.length; i++){				
				var cinfo = cinfos[i];
				var cid = cinfo.split(' ')[1];			
				var cmd = blkio_cmd1 + cid + blkio_cmd3;			
				var enqueueSSHPromise = enqueueSSHCmd(ssh, cmd);
				enqueuePromises.push(enqueueSSHPromise);
				if(++pushed == cinfos.length){
					execSSHCmd(ssh).then(() => {
						Promise.all(enqueuePromises).then((diskinfos) => {					
							disk_obj[ssh_ip] = diskinfos;
							resolve(disk_obj);												
						}).catch((err) => {
							reject(err.toString());
						});
					}).catch((err) => {
						reject(err.toString());
					});
					
				}								
			}		
		});		
	});
}

//Extract all disk metrics from different node (docker container mode)
function getDiskMetrics(cinfo_obj){
	return new Promise((resolve, reject) => {
		var getDiskMetricsPromises = [], pushed = 0;
		for(var i = 0; i < cinfo_obj.length; i++){
			var cinfo = cinfo_obj[i];
			var ssh_ip = Object.keys(cinfo)[0];
			var cinfos = cinfo[ssh_ip];		
			getDiskMetricsPromises.push(getDiskMetricsPromise(ssh_ip, cinfos));
			if(++pushed == cinfo_obj.length){
				Promise.all(getDiskMetricsPromises).then((diskinfos) => {	
					resolve(diskinfos);					
				}).catch((err) => {
						var err_msg = 'Disk data collection fail...: ' + err.toString();
						reject(err_msg);
				});
			}
		}		
	});
}

function getNetMetricsPromise(ssh_ip, cinfos){
	return new Promise((resolve, reject) => {		
		var enqueuePromises = [], net_obj = {}, pushed = 0;
		buildSSHConn(ssh_ip).then((ssh) => {
			var cid_netinfo_arr = [];
			for(var i = 0; i < cinfos.length; i++){				
				var cinfo = cinfos[i];
				var pid = cinfo.split(' ')[0];	
				var cid = cinfo.split(' ')[1];							
				var ln_cmd = ln_cmd1 + pid + ln_cmd2 + cid;
				var ip_netns_cmd = ip_netns_cmd1 + cid + ip_netns_cmd2;
				enqueueSSHCmd(ssh, mkdir_cmd1);
				enqueueSSHCmd(ssh, ln_cmd);								
				var enqueueSSHPromise = enqueueSSHCmd(ssh, ip_netns_cmd);
				enqueuePromises.push(enqueueSSHPromise);
				if(++pushed == cinfos.length){
					execSSHCmd(ssh).then(() => {
						Promise.all(enqueuePromises).then((netinfos) => {	
						for(var j = 0; j < cinfos.length; j++){
							var cid_key = cinfos[j].split(' ')[1].substring(0, 12);
							var cid_netinfo = {};
							cid_netinfo[cid_key] = netinfos[j]; 
							cid_netinfo_arr.push(cid_netinfo);
						}
							net_obj[ssh_ip] = cid_netinfo_arr;						
							resolve(net_obj);												
						}).catch((err) => {
								reject(err.toString());
						});		
					}).catch((err) => {
						reject(err.toString());
					});																	
				}																												
			}		
		});						
	});
}

//Extract all network metrics from different node (docker container mode)
function getNetMetrics(cinfo_obj){
	return new Promise((resolve, reject) => {
		var getNetMetricsPromises = [], pushed = 0;
		for(var i = 0; i < cinfo_obj.length; i++){
			var cinfo = cinfo_obj[i];
			var ssh_ip = Object.keys(cinfo)[0];
			var cinfos = cinfo[ssh_ip];		
			getNetMetricsPromises.push(getNetMetricsPromise(ssh_ip, cinfos));
			if(++pushed == cinfo_obj.length){
				Promise.all(getNetMetricsPromises).then((netinfos) => {						
					resolve(netinfos);					
				}).catch((err) => {
						var err_msg = 'Network data collection fail...: ' + err.toString();
						reject(err_msg);
				});
			}
		}		
	});
}

function startPerfToolPromise(constainer_info){
	return new Promise((resolve, reject) => {
		var pid = constainer_info.split(' ')[0];
		var exec = child_process.exec
			, perf_cmd = '(echo "19910108jp" | sudo -S perf stat -e cache-references,cache-misses,page-faults -p ' + pid + ') 2>' + perf_test_path + ' &';

		var perfProc = exec(perf_cmd, (err, stdout, stderr) => {
			if(err){
				reject(false);
				return;
			}	
			resolve(true);
		});		
	});
}

// only works on physical machine, but VM
function startPerfToolPromise(ssh_ip, cinfos){
	return new Promise((resolve, reject) => {
		var enqueuePromises = [], disk_obj = {}, pushed = 0;
		buildSSHConn(ssh_ip).then((ssh) => {
			for(var i = 0; i < cinfos.length; i++){				
				var cinfo = cinfos[i];
				var pid = cinfo.split(' ')[0];			
				var cmd = '(echo "19910108jp" | sudo -S perf stat -e cache-references,cache-misses,page-faults -p ' + pid + ') 2>' + perf_test_path + ' &';		
				var enqueueSSHPromise = enqueueSSHCmd(ssh, cmd);
				enqueuePromises.push(enqueueSSHPromise);
				if(++pushed == cinfos.length){
					execSSHCmd(ssh).then(() => {
						Promise.all(enqueuePromises).then((diskinfos) => {												
							resolve(true);												
						}).catch((err) => {
							reject(err.toString());
						});
					}).catch((err) => {
						reject(err.toString());
					});					
				}								
			}		
		});		
	});
}
// only works on physical machine, but VM
function endPerfToolPromise(){
	return new Promise((resolve, reject) => {
		var exec = child_process.exec;
		var perf_pid = findPerfPid().toString().trim().split('\n')[1];		
		var perf_cmd = 'sudo kill -INT ' + perf_pid;
		exec(perf_cmd, (err, stdout, stderr) => {
			if(err){
				reject(false);
				return;
			}
			resolve(true);
		});		
	});
}
function findPerfPid(){
	var execSync = child_process.execSync;
	var ps_cmd = 'ps -C perf -o pid';
	var perf_pid = execSync(ps_cmd);
	return perf_pid;
}

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

function deleteEmptyContainer(cObjArr){
	var new_cObjArr = [];	
	for(var i = 0; i < cObjArr.length; i++){
		var cObj = cObjArr[i];
		var ips = Object.keys(cObj);
		var ip = ips[0];
		
		if(cObj[ip]){	
			new_cObjArr.push(cObj);
		}		
	}
	return new_cObjArr;
}

var fun_interval = null;
function firstCollection(res){	
	// store container information	
	var rt_metric = {};		
	start = new Date();
	fun_interval = setInterval(() => {getRSSMetrics(container_info_obj).then((rss) => {
			mem_usage_obj[mem_count++] = rss			
		});}, 5000);
		
	setTimeout(() => {
		clearInterval(fun_interval);		
	}, 100000);
	

	var cpu_promise = getCPUMetrics(container_info_obj);
	var net_promise = getNetMetrics(container_info_obj);
	var disk_promise = getDiskMetrics(container_info_obj);
	Promise.all([cpu_promise, disk_promise, net_promise]).then((data) => {
		rt_metric.cpu = data[0];
		rt_metric.disk = data[1];		
		rt_metric.net = data[2];			
		rt_metrics.one = rt_metric;		
		var rt_metrics_str = JSON.stringify(rt_metrics);		
		fs.writeFileSync(metrics_path, rt_metrics_str, 'utf8');			
		numOfCPU = 0;
		res.status(200).send('OK');
	}).catch((data) => {res.status(400).send(data.toString());});

}

function secondCollection(res){
	var rt_metric = {};	
	var cpu_promise = getCPUMetrics(container_info_obj);
	var net_promise = getNetMetrics(container_info_obj);
	var disk_promise = getDiskMetrics(container_info_obj);
	Promise.all([cpu_promise, disk_promise, net_promise]).then((data) => {
		end = new Date() - start;
		rt_metric.cpu = data[0];
		rt_metric.disk = data[1];
		rt_metric.net = data[2];
		var rt_metrics_obj = JSON.parse(fs.readFileSync(metrics_path, 'utf8').toString());
		rt_metrics_obj.two = rt_metric;
		rt_metrics_obj.rss = mem_usage_obj;
		rt_metrics_obj.interval = end / 1000;
		rt_metrics_obj.placement = container_placement;
		var rt_metrics_str = JSON.stringify(rt_metrics_obj);
		fs.writeFile(metrics_path, rt_metrics_str, (err) => {
			if(err) throw err;			
			res.status(200).json(rt_metrics_obj);	
			mem_usage_obj = {};
			container_placement = {};
			host_json_obj = {};
			mem_count = 0;							
		});		
	}).catch((data) => {res.status(500).send(data.toString());});
}

runRC();
