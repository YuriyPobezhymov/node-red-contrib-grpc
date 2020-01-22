module.exports = function (RED) {
    'use strict'
    let grpc = require("grpc");
    let utils = require('../utils/utils');
	var protoLoader = require("@grpc/proto-loader");

    function gRpcServerNode(config) {
        var node = this;
        RED.nodes.createNode(node, config);
        node.server =  config.server || "0.0.0.0";
        node.port = config.port || 5001;
        node.name = config.name;
        node.protoFile = config.protoFile;
        node.localServer = config.localServer;

        // read the package name from the protoFile
        var packageName = config.protoFile.match(new RegExp(/package\s+([^;="]*);/));
        if (packageName && packageName.length == 2) {
            node.protoPackage = packageName[1];
        }

        createGRPCServer(node);
        
        node.on("error", function(error) {
            node.error("gRPC Server Error - " + error);
            console.log(error);
        });
		
        node.on("close", function(done) {
            if (this.localServer) {
                stopServer(this);
                console.log("### gRPC server stopped ###");
            }
            done();
        });
    }	

    function createGRPCServer(node) {
        try {
            var protoFunctions = {};
            var fileName =  utils.tempFile('proto.txt', node.protoFile)
			
            let proto = grpc.loadPackageDefinition(
                protoLoader.loadSync(fileName, {
                    keepCase: true,
                    longs: String,
                    enums: String,
                    defaults: true,
                    oneofs: true
                })
            );
           
            // If we start a local server
            if (node.localServer) {
                var server = new grpc.Server();
                // Parse the proto file
                var services = proto;
                if (node.protoPackage) {
                    services = proto[node.protoPackage];
                }

                // For each service
                for (var serviceName in services) {
                    if ('service' in services[serviceName]) {
                        //console.log(serviceName);
                        var methods = Object.keys(services[serviceName].service);
                        for(var methodId in methods) {
                            protoFunctions[methods[methodId]] = generateFunction(node, serviceName, methods[methodId], protoFunctions);
                        }
                        // Add stub methods for each methods and services declared in the proto file
                        server.addService(services[serviceName].service, protoFunctions);
                    }
                }
                
                server.bind(node.server + ":" + node.port, grpc.ServerCredentials.createInsecure());
                server.start();
                console.log("### GRPC Server started ### ");
                node.protoFunctions = protoFunctions;
                node.grpcServer = server;		
            }
            node.proto = proto;
                
        } catch (err) {
            node.error("createGRPCServer - " + err);
            console.log(err);
        }
    }

    function generateFunction(node, service, method) {
        try {
            var methodName = utils.getMethodName(service, method);
            var body = 
            'if (this["'+ methodName +'"]) { \
                this["'+ methodName +'"](arguments)\
            } else { \
                console.log("Calling unimplemented method '+ method + ' for service ' + service + '"); \
            }';
            var func = new Function(body);
            return func;
        } catch (err) {
            node.error("generateFunction - " + err);
            console.log(err);
        }
        return null;
	}
   
    function stopServer(node) {
        console.log("#### Stoping server ")
        try {
            if (node.grpcServer) {
                node.grpcServer.forceShutdown();
                delete node.grpcServer;
            }
        } catch (err) {
            node.error("stopServer - " + err);
            console.log(err);
        }
	}

    RED.nodes.registerType("grpc-server", gRpcServerNode, {});	
}
