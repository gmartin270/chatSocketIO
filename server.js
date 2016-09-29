/**
 * 
 */
//Redis
var redis = require('redis');
var cliRedis = redis.createClient();

cliRedis.on('connect', function() {
    console.log('Connected to Redis');
});

cliRedis.on('error', function(err){
	console.log('Redis Error: ' + err);
});

//Async
var async = require('async');

//Express
var express = require('express');
var app = express();

//Http Server
var server = require('http').createServer(app); //aca adorno al protocolo http con express

//SocketIO
var io = require("socket.io").listen(server);
io.set('log level', 1); //cambio el nivel de logging a warning

var port = process.env.PORT || 8080;  //Del lado izquierdo se toma una variable de entorno, si no existe o no está definida el valor por defecto es el 8080

server.listen(port);

app.get('/', function(req, res){
	res.sendfile(__dirname+"/index.html");
})

io.sockets.on('connection', function(socket){
	console.log("se conecto un cliente");
	
	socket.on('ingresar', function(alias){
		var usuarios;
		
		if(alias != null){
			socket.set('alias', alias); //asigno un alias al socket. El alias es el nombre del nickname.
			socket.broadcast.emit('mensajes', alias + " se ha unido al chat.");
			
			//Se envía al usuario los ultimos mensajes del chat.
			cliRedis.lrange('queueMsg', 0, -1, function(err, reply){
				socket.emit('pastMsg', reply);
			})
			
			async.series([
			              function(cb){
			            	  cliRedis.sadd(['aliases', alias], function(err, reply){
			            		  if(err != null)
			            			  console.log("Redis error: " + err);
							
			            		  if(reply != null)
			            			  console.log("Redis log: " + reply);
							
			            		  cb(null, "add");
							  });
			              },
			              async.apply(refreshUserList, socket)
			            ], 
						function(err, results){
							console.log(results);
						});
		}
		
	});
	
	socket.on('mensajes', function(message){
		socket.get('alias', function(err, alias){
			var msg = alias + ": " + message;
			
			socket.broadcast.emit('mensajes', msg);
			queueMessageList(msg);
		});
		
		console.log("Mensaje recibido: " + message);
	})
	
	socket.on('end', function (alias) {
	    socket.set('alias', alias);
	    socket.broadcast.emit('mensajes', alias + " se ha retirado del chat.");
	    console.log('cliente desconectado: ' + alias);
	    
	    async.series([
		              function(cb){
		            	  cliRedis.srem(['aliases', alias], function(err, reply){
		            		  if(err != null)
		            			  console.log("Redis error: " + err);
						
		            		  if(reply != null)
		            			  console.log("Redis log: " + reply);
						
		            		  cb(null, "remove");
						  });
		              },
		              async.apply(refreshUserList, socket)
		            ], 
					function(err, results){
						console.log(results);
					});
		
	});
});

function refreshUserList(socket, cb){
	var usuarios;
	
	async.series([
	              function(cb){
	            	  cliRedis.smembers('aliases', function(err, reply){
	            		  usuarios = reply;
	            		  console.log(reply);
	            		  cb(null, "list");
	            	  });
	              },
	              function(cb){
	            	  socket.broadcast.emit('usuarios', usuarios);
	            	  socket.emit('usuarios', usuarios);
	            	  cb(null, "emmit");
	              }
	            ], 
				function(err, results){
					console.log(results);
				});
	
	cb(null, 'refresList');
}

function queueMessageList(msg){
	var count;
	
	async.series([
	              function(cb){
	            	  //Cuantos mensajes hay en la cola?
	            	  cliRedis.llen('queueMsg', function(err, reply){
	            		  count = reply;
	            		  cb(null, null);
	            	  })
	              },
	              function(cb){
	            	  console.log("msg count:" + count);
	            	  
	            	  //Si hay 10 retiro el primero de la cola
	            	  if(count == 10){ //TODO: Eliminar hardcode
	            		  cliRedis.blpop('queueMsg', 0, function(err, reply){
	            			  cb(null, null);
	            		  });
	            	  }else
	            		  cb(null, null);
	            		  
	              },
	              function(cb){
	            	  //Agrego nuevo mensaje en la cola
	            	  cliRedis.rpush(['queueMsg', msg], function(err, reply){
	            		  cb(null, null);
	            	  });
	              }
	              ],
			function(err, result){
				
			}
	);
}

console.log("el server escucha en " + port);