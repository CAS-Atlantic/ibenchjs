// This class is a benchmarking application of cache references

var LOOPS = 80000;

exports.memIntensive = function memIntensive(req, res){
	setTimeout(() => {
		const buff = [];
		for(var i = 0; i < LOOPS; i++){
			var car = {type:"suv", model:"300", color:"white"};
			buff[i] = car;		
		}	
		res.status(200).send('OK');		
	}, 500);	
}
