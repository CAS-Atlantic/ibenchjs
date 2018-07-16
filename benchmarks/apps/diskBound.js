// This Disk-intensive application
var Promise = require('promise')
exports.diskIntensive = function diskIntensive(req, res){	
	var extension = '.txt'
		, dir_name = 'tmp/'
		, content = Date.now().toString()
		, file_name = dir_name + content + extension;
		
	write2file(file_name, content).then((data) => {
		res.status(200).send(data);
	}).catch((err) => {
		res.status(500).send(err);
	});
	
}

function write2file(path, content){
	return new Promise((resolve, reject) => {
		var fs = require('fs');
		var ws = fs.createWriteStream(path);
		ws.write(content);
		ws.on('finish', () => {  
			resolve('OK');
		});
		ws.on('error', (err) => {  
			reject(err.toString());
			
		});	
		ws.end();
	});
}





