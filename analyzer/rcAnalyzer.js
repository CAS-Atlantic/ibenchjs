const fs = require('fs');

const report_path = './results_node_DC_EIS/'
	, rc_metric_filename = 'analyzer/rc_metric.json'
	, result_filename = 'result.txt';

var interval = 0;
var rc_metrics = {};
var dilm = ',';
var jmeter_output_path = process.argv.slice(2).toString();



function doWork(){
	//var topDir = findReport()	
		//, metrics_path = report_path + topDir + rc_metric_filename
	
	var metrics_path = rc_metric_filename;
	fs.readFile(metrics_path, 'utf-8', (err, data) => {
		if(err) throw err;
		var jmeter_metrics = ''; 
		
		var metric_json = JSON.parse(data);
		var metric_first = metric_json.one
			, metric_second = metric_json.two;
		interval = parseFloat(metric_json.interval);
		var cpu_first = metric_first.cpu
			, cpu_second = metric_second.cpu;
		var net_first = metric_first.net
			, net_second = metric_second.net;
		var disk_first = metric_first.disk
			, second_disk = metric_second.disk;
		var rss = metric_json.rss;
		var placementObj = metric_json.placement;
		var placement = parsePlacement(placementObj);
		rc_metrics.cpu = parseCPUDataByContainer(cpu_first, cpu_second);
		var mem_log_path = 'mem_log.txt';
		rc_metrics.rss = parseRSSData(rss);
		rc_metrics.net = parseNetData(net_first, net_second);
		rc_metrics.disk = parseDiskData(disk_first, second_disk);						
		var metric_str = calculateRM(rc_metrics);	
					
		if(jmeter_output_path.trim() != null && jmeter_output_path.trim() != ''){	
			parseJmeterLogs(jmeter_output_path).then((data) => {
				jmeter_metrics = data;
				console.log(jmeter_metrics + ',' + placement + ',' + metric_str);
			});
		}else{
			console.log(metric_str + ',' + placement);
		}	
	});	
}

function findReport(){
	var dir_arr = fs.readdirSync(report_path);
	var max_dir = dir_arr.sort(sortStr);
	return max_dir[0] + '/';
}

var sortStr = function(dir1, dir2){
	dir1 = report_path + dir1;
	dir2 = report_path + dir2;
	var time1 = fs.statSync(dir1).ctime; 
	var time2 = fs.statSync(dir2).ctime;
	if(time1 > time2) return -1;
	if(time1 < time2) return 1;
	return 0;
}

function parsePlacement(placementObj){
	var ips = Object.keys(placementObj);
	var placement = '';
	for(var i = 0; i < ips.length; i++){
		var ip = ips[i];
		var cNum = placementObj[ip];
		var tmp = ip + ',' + cNum;
		placement = placement + tmp + ',';
	}
	return placement;
}
// [{"192.168.1.40":[{"e34b0bb48d19":"user 1893\r\nsystem 4560"},{"b75eac605256":"user 2432\r\nsystem 1843"}]},
//{"192.168.1.41":[{"e7cc5d0a0895":"user 1974\r\nsystem 1972"},{"c034452f3284":"user 1819\r\nsystem 3984"}]},
//{"192.168.1.43":[{"fd83179a3bc1":"user 1623\r\nsystem 2207"}]}]
function parseCPUDataByContainer(f, s){
	//console.log(JSON.stringify(f), 'After\n', JSON.stringify(s));
	if(f.length > 0 && s.length > 0 && f.length == s.length){
		var hertz = 100
			, pushed = 0
			, cpu_metrics = f;
		for(var i = 0; i < f.length; i++){			
			var ip = Object.keys(f[i])[0]; // e.g. 192.168.1.40
			var cpu_first_infos = f[i][ip]; //e.g. [{"e34b0bb48d19":"user 1893\r\nsystem 4560"},{"b75eac605256":"user 2432\r\nsystem 1843"}]	
			var cpu_second_infos = s[i][ip];
			for(var j = 0; j < cpu_first_infos.length; j++){
				var cid = Object.keys(cpu_first_infos[j])[0]; //e.g. e34b0bb48d19				
				var cpu_first_info = cpu_first_infos[j][cid].toString(); // e.g. user 1893 system 4560
				var cpu_second_info = cpu_second_infos[j][cid].toString();
				var first_user = cpu_first_info.split('\r\n')[0].split(' ')[1].trim();
				var first_sys = cpu_first_info.split('\r\n')[1].split(' ')[1].trim();				
				var first_sum = parseFloat(first_user) + parseFloat(first_sys);				
				
				var second_user = cpu_second_info.split('\r\n')[0].split(' ')[1].trim();
				var second_sys = cpu_second_info.split('\r\n')[1].split(' ')[1].trim();				
				var second_sum = parseFloat(second_user) + parseFloat(second_sys);				
				var cpuUtilization = (((second_sum - first_sum) / hertz) / interval) * 100;
				cpu_metrics[i][ip][j][cid] = cpuUtilization;
				
			}											
		}
		return cpu_metrics;
	}else{
		console.log('Error occurs');
	}	
}

function parseRSSData(rss){
	var keys = Object.keys(rss);
	//console.log(rss);
	var sum = 0, avg = 0, item = 0, rss_metrics = [];
	var n = keys.length;
	var rss_arr = [];
	for(var i = 0; i < keys.length; i++){
		var key = keys[i];
		var rss_infos = rss[key];
		for(var j = 0; j < rss_infos.length; j++){
			var rss_info = rss_infos[j];
			var ip = Object.keys(rss_info)[0];
			var rss_raw_data = rss_info[ip];
			for(var k = 0; k < rss_raw_data.length; k++){
				var rss_data = parseFloat(rss_raw_data[k].split('\n')[1]);
				if(! isNaN(rss_data)){
					sum = sum + rss_data;
					item = rss_data + item;
				}else{
					n--;
				}			
			}
		}
		rss_arr.push(item);		
		item = 0;
	}
	var rss_obj = {};
	rss_obj.rss = rss_arr.toString();
	rss_metrics.push(rss_obj);
	avg = sum / n;
	rss_metrics.push(avg / 1000); //mb
	
	return rss_metrics;
}

function extractNetRawData(raw_net_metric_data_arr){	
	if(raw_net_metric_data_arr.length > 0){
		var rx_sum = 0 // RX:
			, tx_sum = 0 //TX:		
			, nets = raw_net_metric_data_arr; // ip_val
		for(var i = 0; i < raw_net_metric_data_arr.length; i++){	
			var raw_net_metric_obj = raw_net_metric_data_arr[i];
			var ip = Object.keys(raw_net_metric_obj)[0];
			var cid_net_infos = raw_net_metric_obj[ip];
			for(var j = 0; j < cid_net_infos.length; j++){				
				var cid = Object.keys(cid_net_infos[j])[0];
				var cid_net_info = cid_net_infos[j][cid].trim().replace(/ +/g, ' ');
				var rx_regex = /RX bytes:([0-9]+)/g;
				var tx_regex = /TX bytes:([0-9]+)/g;
				
				var rx_results = cid_net_info.match(rx_regex).toString().split(',');
				var tx_results = cid_net_info.match(tx_regex).toString().split(',');
				
				for(var k = 0; k < rx_results.length; k++){
					var rx = parseFloat(rx_results[k].split(':')[1]);	
					rx_sum = rx_sum + rx;
					var tx = parseFloat(tx_results[k].split(':')[1]);
					tx_sum = tx_sum + tx;
					
				}
				nets[i][ip][j][cid] = rx_sum + ':' + tx_sum;
				rx_sum = 0;
				tx_sum = 0;
				//nets[i][ip][j][cid] = rx_sum + ':' + tx_sum;
				
				// Sample output: [{"192.168.1.40":[
					//{"e34b0bb48d19":"16765414:1428155984"},{"b75eac605256":"34183327:2958854248"}]},
						//{"192.168.1.41":[{"e7cc5d0a0895":"48830519:4178489454"},{"c034452f3284":"63633419:5386212722"}]},
						//{"192.168.1.43":[{"fd83179a3bc1":"80452017:6836402956"}]}]
			}		
		}
		
	}
	//console.log(JSON.stringify(nets));
	return nets;
}

function parseNetData(f, s){	
	var net_metrics = f;
	var extracted_raw_f = extractNetRawData(f)
		, extracted_raw_s = extractNetRawData(s);	
		
	//console.log('First: ', JSON.stringify(extracted_raw_f), '\nSecond: ', JSON.stringify(extracted_raw_s));
	if(f.length > 0 && s.length > 0 && f.length == s.length){
		for(var i = 0; i < extracted_raw_f.length; i++){
			var ip = Object.keys(extracted_raw_f[i]);
			var first_tx_rx_nets = extracted_raw_f[i][ip];
			var second_tx_rx_nets = extracted_raw_s[i][ip];
			for(var j = 0; j < first_tx_rx_nets.length; j++){
				var cid = Object.keys(first_tx_rx_nets[j])[0];
				var first_rx = parseFloat(first_tx_rx_nets[j][cid].split(':')[0]) / 1000000;
				var first_tx = parseFloat(first_tx_rx_nets[j][cid].split(':')[1]) / 1000000;
				var second_rx = parseFloat(second_tx_rx_nets[j][cid].split(':')[0]) / 1000000;
				var second_tx = parseFloat(second_tx_rx_nets[j][cid].split(':')[1]) / 1000000;
				var rx = (second_rx - first_rx) / interval;
				var tx = (second_tx - first_tx) / interval;
				net_metrics[i][ip][j][cid] = rx + ':' + tx;				
			}
		}
	}
	return net_metrics;
}

/* [{"192.168.1.185":["Total 0","8:0 Read 23752704\n
								8:0 Write 0\n
								8:0 Sync 0\n
								8:0 Async 23752704\n
								8:0 Total 23752704\n
								Total 23752704"]},
{"192.168.1.179":["Total 0","8:0 Read 23359488\n8:0 Write 0\n8:0 Sync 0\n8:0 Async 23359488\n8:0 Total 23359488\nTotal 23359488"]}]
*/
function parseDiskData(f, s){
	
	var f_sum = 0
		, s_sum = 0
		, disk_metrics = [];
	if(f.length > 0 && s.length > 0 && f.length == s.length){
		for(var i = 0; i < f.length; i++){
			var ip = Object.keys(f[i]);
			var ios = f[i][ip];			
			for(var j = 0; j < ios.length; j++){
				var io = ios[j];
				
				if(io != ''){
					var disk_arr = io.split('\n');					
					if(disk_arr.length > 1){
						io = disk_arr[disk_arr.length - 1].split(' ')[1];
						
					}else{
						io = disk_arr[0].split(' ')[1];
					}				
					var io = parseInt(io);
					f_sum = f_sum + io;			
				}
			}						
		}
		disk_metrics.push(f_sum);		
		for(var i = 0; i < s.length; i++){
			var ip = Object.keys(s[i]);
			var ios = s[i][ip];
			
			for(var j = 0; j < ios.length; j++){
				var io = ios[j];
				if(io != ''){
					var disk_arr = io.split('\n');					
					if(disk_arr.length > 1){
						
						io = disk_arr[disk_arr.length - 1].split(' ')[1];
					}else{
						io = disk_arr[0].split(' ')[1];
					}						
					var io = parseInt(io);
					s_sum = s_sum + io;			
				}
			}				
		}
		disk_metrics.push(s_sum);
	}							
	return disk_metrics;
}

function calculateRM(rc_metrics){
	var cpu_arr = rc_metrics.cpu;
	var net_arr = rc_metrics.net;			
	var metric_arr = cpu_arr;
	var metrics = '';
	var cpu_info_total_obj = {};
	
	for(var i = 0; i < cpu_arr.length; i++){
		var ip = Object.keys(cpu_arr[i])[0];
		var cpu_infos = cpu_arr[i][ip];
		var net_infos = net_arr[i][ip];
		var cpu_info_total = 0.0;
		var net_rx_total = 0.0;
		var net_tx_total = 0.0;
		for(var j = 0; j < cpu_infos.length; j++){
			var cid = Object.keys(cpu_infos[j])[0];
			cpu_info_total = cpu_info_total + parseFloat(cpu_infos[j][cid]);
			net_rx_total = net_rx_total + parseFloat(net_infos[j][cid].split(':')[0]);
			net_tx_total = net_tx_total + parseFloat(net_infos[j][cid].split(':')[1]);
			var metric = ip + ',' + cid + ',' + cpu_infos[j][cid] + ',' + net_infos[j][cid].split(':')[0] + ',' + net_infos[j][cid].split(':')[1] + ',';
			metrics =  metrics + metric;
			metric_arr[i][ip][j][cid] = metric;
		}
		cpu_info_total_obj[ip] = cpu_info_total + dilm + net_rx_total + dilm + net_tx_total;
		cpu_info_total = 0.0;
		net_rx_total = 0.0;
		net_tx_total = 0.0;
	}
	var cpu_net_total_info = '';
	var ips = Object.keys(cpu_info_total_obj);
	for(var k = 0; k < ips.length; k++){
		var ip = ips[k];
		var cpu_net_total = cpu_info_total_obj[ip];
		var cpu_net_info = ip + dilm + cpu_net_total + dilm;
		cpu_net_total_info = cpu_net_total_info + cpu_net_info;
	}
	
	var disk_arr = rc_metrics.disk;
	var f_disk = parseFloat(disk_arr[0]) / 1000000, s_disk = parseFloat(disk_arr[1]) / 1000000;
	var disk = (s_disk - f_disk) / interval;	
	var rss = rc_metrics.rss;
	return metrics + dilm + dilm + cpu_net_total_info + dilm + disk + dilm + rss[1] + dilm; // [cpu, net_rx, net_tx, disk, mem]
	//return cpuUtilization + dilm + rx + dilm + tx + dilm + disk + dilm + rss[1] + dilm + rss[0].rss; // [cpu, net_rx, net_tx, disk, mem]
}

function averageData(){
	return new Promise((resolve, reject) => {
		fs.readFile(result_filename, 'utf-8', (err, data) => {
			if(err){reject(err.toString()); return;}
			var fine_result = {}
				, k = 0, pushed = 0;				
	
			var raw_data_arr = data.split('\n');			
			for(var i = 0; i < raw_data_arr.length; i++){
				var raw_data_item = raw_data_arr[i].trim();
				var nodeName = raw_data_item.split(': ')[0].split('-')[1].trim();
				var raw_metric = raw_data_item.split(': ')[1].split(', ');									
				var instance_num = raw_metric[1].trim();
				var thr = parseFloat(raw_metric[2].trim());
				var rt95 = parseFloat(raw_metric[3].trim());
				var rt99 = parseFloat(raw_metric[4].trim());
				var cpu = parseFloat(raw_metric[5].trim());
				var rx = parseFloat(raw_metric[6].trim());
				var tx = parseFloat(raw_metric[7].trim());
				var disk = parseFloat(raw_metric[8].trim());
				var mem = parseFloat(raw_metric[9].trim());
				var key = nodeName + '-' + instance_num;
							
				if(!(key in fine_result)){
					var val = thr + dilm + rt95 + dilm + rt99 + dilm + cpu + dilm + rx + dilm + tx + dilm + disk + dilm + mem;					
					fine_result[key] = val;
				}else{
					k++;
					var preAvg_arr = fine_result[key].split(dilm);
					var preAvg_thr = parseFloat(preAvg_arr[0]);
					var preAvg_rt95 = parseFloat(preAvg_arr[1]);	
					var preAvg_rt99 = parseFloat(preAvg_arr[2]);
					var preAvg_cpu = parseFloat(preAvg_arr[3]);
					var preAvg_rx = parseFloat(preAvg_arr[4]);
					var preAvg_tx = parseFloat(preAvg_arr[5]);
					var preAvg_disk = parseFloat(preAvg_arr[6]);
					var preAvg_mem = parseFloat(preAvg_arr[7]);
					var curAvg_thr = preAvg_thr + (thr - preAvg_thr) / k;
					var curAvg_rt95 = preAvg_rt95 + (rt95 - preAvg_rt95) / k;
					var curAvg_rt99 = preAvg_rt99 + (rt99 - preAvg_rt99) / k;
					var curAvg_cpu = preAvg_cpu + (cpu - preAvg_cpu) / k;
					var curAvg_rx = preAvg_rx + (rx - preAvg_rx) / k;
					var curAvg_tx = preAvg_tx + (tx - preAvg_tx) / k;
					var curAvg_disk = preAvg_disk + (disk - preAvg_disk) / k;
					var curAvg_mem = preAvg_mem + (mem - preAvg_mem) / k;
					var cur_val = curAvg_thr + dilm + curAvg_rt95 + dilm + curAvg_rt99 + dilm + curAvg_cpu + dilm + 
								curAvg_rx + dilm + curAvg_tx + dilm + curAvg_disk + dilm + curAvg_mem;					
					fine_result[key] = cur_val;
					
				}				
					if(++pushed == raw_data_arr.length){				
						
						k = 0;						
						resolve(fine_result);
					}											
			}		
		});		
	});	
}

function parseJmeterLogs(jmeter_output_path){
	return new Promise((resolve, reject) => {
		var count = 0
			, errCount = 0
			, dataArr = []
			, resp = []
			, result = {}
			, ts = -1
			, maxTS = -1
			, minTS = -1;		
			
		const rl = require('readline').createInterface({
			input: fs.createReadStream(jmeter_output_path),
			output: process.stdout,
			terminal: false
		});
		rl.on('line', (line) => {
			dataArr = line.split(',');
			if(dataArr[3] === '200'){
				resp[count++] = Number(dataArr[13]);
				ts = dataArr[0];
				if(count === 1 || Number(ts) < Number(minTS))
					minTS = ts;
				if(count === 1 || Number(ts) > Number(maxTS))
					maxTS = ts;

			}else{
				errCount++;
			}
		});
		rl.on('close', () => {
			if(count > 1){
				var metrics = [];
				result.status = 'succeed';
				resp.sort(function(a, b){
					return a - b;
				});
				var n = resp.length - 1;
				var throughput = 1000 * count / (maxTS - minTS);
				var resp95 = resp[parseInt(0.95 * n)];
				var resp100 = resp[n];			
				metrics[0] = throughput;
				metrics[1] = resp95;
				metrics[2] = resp100;
				metrics[3] = count;
				metrics[4] = errCount-1;
				result.metrics = metrics;	

			}else{
				var err = 'Error: ' + count;
				result.status = err;
				reject(err);
			}				
			resolve(metrics);			
		});
	});
}

doWork();
/*
averageData().then((data) => {
	var keys = Object.keys(data);
	for(var i = 0; i < keys.length; i++){
		var key = keys[i];
		var val = data[key];
		var str = key + dilm + val + '\n';
		fs.appendFileSync('avg_result.txt', str);
	}		
});
*/

