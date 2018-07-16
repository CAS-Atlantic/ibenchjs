const os = require('os')
	, cluster = require('cluster')
	, app = require('express')();

// Server side parameters
var cpuCounts = Number(process.env.CPU_COUNT)
	, app_host = process.env.SERVER_IP
	, app_port = process.env.SERVER_PORT
	, prime_num = Number(process.env.PRIME);


function runBenchmark(){
	console.log(app_host, app_port);
	const fs = require('fs');
	if(cpuCounts === 0){
		console.log('Process ' + process.pid + ' starts working');		
		startSingleApp();
	}else{		
		startClusterMode();
	}		
}

function startSingleApp(){
	var cpuBound = require('./apps/cpuBound')
		, diskBound = require('./apps/diskBound')
		, netInBound = require('./apps/netInBound')
		, netOutBound = require('./apps/netOutBound')		
		, memBound = require('./apps/memBound')
		, server = app.listen({ host: app_host, port: app_port});
	
	app.get('/', function(req, res) {
		res.status(200).send("OK");
	});
	
	// process the CPU-intensive task	
	app.get('/getcpubound', (req, res) => {
		cpuBound.isPrime(req, res, prime_num);
	});
	
	// process the disk-intensive task
	app.get('/getdiskbound', diskBound.diskIntensive);
	
	// process process Hello World task  (network incoming task)
	app.post('/getnetinbound', netInBound.netInIntensive);
	
	// process network ougoing task 
	app.get('/getnetoutbound', netOutBound.netOutIntensive);
	
	// process cache hit intensive task
	app.get('/getmembound', memBound.memIntensive);
	
	
	//stop the server
	app.get('/stopserver', function stopServer(req, res) {
		server.close();
		process.exit(0);
	});	
}

function startClusterMode(){
	if(cluster.isMaster){		
		if(cpuCounts === undefined || cpuCounts < 0){
			cpuCounts = os.cpus.length;
		}
		console.log('One Master Process (' + process.pid + ') ' + cpuCounts + ' Child Process(es)');	
		for (var i=0 ;i < cpuCounts; i++) {
			cluster.fork();						
		}	
		cluster.on('online', function(child) {
			console.log('Child Process:' + child.process.pid + ' is processing');			
		});
		
		cluster.on('exit', function(child, code, signal) {
			console.log('exit event occured. Stopping the server');
			process.exit(0);
		});
	}else{
		startSingleApp();		
	}
}

var clear = function(dir){	
	const fs = require('fs')
		, path = require('path');	
	if(fs.existsSync(dir)){
		var files = fs.readdirSync(dir);
		for(var i = 0; i < files.length; i++){
			var file = path.join(dir, files[i]);
			var stat = fs.statSync(file);
			if(file === '.' || file === '..'){
				continue;
			}else if(stat.isDirectory()){
				clear(dir);
			}else{
				fs.unlinkSync(file);
			}	
		}
		fs.rmdirSync(dir);	
	}	
}

runBenchmark();
