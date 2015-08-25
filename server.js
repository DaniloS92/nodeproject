
/*IMPORTACIONES*/

var http=require('http');//modulo para crear el servidor
var server=http.createServer().listen(3000);//asignando el puerto
var io=require('socket.io').listen(server);//modulo sokcet.io para conectividad con el ciente en tiempo real
//var querystring=require('querystring');
var serialport = require("serialport");//modulo para conectarse con los puertos seriales 
var SerialPort = serialport.SerialPort;//instanciando el modulo de serialPort(obligatorio)
var sqlite3 = require('sqlite3').verbose();//modulo para conectarse con la base de datos SQLite
var fs = require('fs');//modulo para leer y escribir archivos en este caso JSON
var modelo = require('./consultas.js');//importando otra clase exclusiva para las consultas

/*CREACION DE VARIABLES GLOBALES*/

//var puerto;
var sp;//variable donde se instanciara temporalmente el puerto serial para poder administrarlo
var timout;//controloar los tiempos de intervalo de encendido y apagado de las bonbas de agua en este caso
var timeIn;

//creacion de variables globales

var numSen1,numSen2;// numeros que se reciven del sensor 1 y 2 para parsear y evitar errores
var arrayComparaciones; // array que hara las comparaciones de los datos anteriores obtenidos de las medidas

var diasSemana = new Array("Domingo","Lunes","Martes","Miercoles","Jueves","Viernes","Sabado");//vector para calcular los dias de la semana
var datos;//vector donde se van a guardar los resultados de los dias y las horas qye se efectuaran los actuadores
var arraySerialPort = new Array();//vector donde se guardaran los conectores de los puertos seriales disponibles
var puertoAct;//alamacena el puerto actual para realizar la conexion por ese puerto


var hoy;
var dd;
var mm; //hoy es 0!
var yyyy;
var hora;
var minutos;
var segundos;
var bandera = false;

//Iniciamos el objeto de conexion
io.on('connection',function(socket){

	console.log("Si esta conectando");

	serialport.list(function (err, ports) {//metodo del modulo de serialPort que me permite saber que puertos seriales estan conectados
		ports.forEach(function(port) {
			console.log("Puerto: "+port.comName);
			console.log("Id "+port.pnpId);
    		console.log("Manufacturador: "+port.manufacturer);
            if(port.manufacturer.toString().toUpperCase().indexOf("ARDUINO")!=-1)
			arraySerialPort.push(port.comName);//asignamos los nombres de los puertos al vector
		});
		console.log('Lista de puertos cargados en el inicio: '+arraySerialPort);
		socket.emit('lista puertos',arraySerialPort);//una vez obtenidos los nombres de lso vectores los enviamos al cliente
		arraySerialPort = [];//reseteamos el vector para ingresar nuevos datos
	});

    actualizarSerialPort();

    //------------------------------CONEXION AL PUERTO SERIAL-------------------------------//

	socket.on('set puerto',function(data){

        console.log("Estableciendo la conexion con el puerto: "+data);
		puertoAct = data;

        if(sp==null){

            sp = new SerialPort(data,{

                baudrate: 9600,
                parser: serialport.parsers.readline("\n")

            });
            sp.on('open',onOpen);
            sp.on('data',onData);
            sp.on('close',mostrarPuertoCerrado);
        }
	});

    //--------------------------ABRIENDO EL PUERTO SERIAL----------------------------------//

    function onOpen(){
        console.log("Se conecto al puerto: "+puertoAct);
        console.log("Esperando datos....");
        //InicioTemporizadores('2','1','M');
        //setInterval(function(){
			//calcularEventos();
		//},10000)
    }


    //---------------------------RECIVIENDO LOS DATOS DEL PUERTO---------------------------//

    function onData(data){
        console.log(data);
        var com = parseInt(data);
        if(com == 1011010) {
            console.log("Confirmacion recivida");
            sp.write("S");
            //sp.write("A");
        }else{
            console.log(data.split(";")); //debug :v
            var vectorDatos=data.split(";");
            var sen1 = parseInt(vectorDatos[0]);
            var sen2 = parseInt(vectorDatos[1]);

            io.emit("obtener medidas",vectorDatos);

            //llamar al metodo de alertas e inicio del riego automatico si tubuiera q ser asi

            //-------------------------------------------------------------------------------

            calcularEventos();

            if(validacion2(vectorDatos)){
            //if (validacion(sen1,sen2)){
                hoy = new Date();
                dd = hoy.getDate();
                mm = hoy.getMonth()+1; //hoy es 0!
                yyyy = hoy.getFullYear();
                hora = hoy.getHours();
                minutos = hoy.getMinutes();
                segundos = hoy.getSeconds();

                var cadena='{\n';
                //se agregara un for para los n sensores que se utilizaran
                //--------------------------------------------------------
                for(var i = 0; i<vectorDatos.length;i++){
                    cadena+='"sensor_"'+i+':'+vectorDatos[i]+',\n';
                }
                //--------------------------------------------------------
                cadena+='"fecha_lectura":"'+dd+'/'+mm+'/'+yyyy+'",\n';
                cadena+='"hora_lectura":"'+hora+':'+minutos+':'+segundos+'",\n';
                cadena+='"nodo_sensor": "nodo 1",\n';
                cadena+='"parcela": "parcela 1"\n';
                cadena+='},\n';
                fs.appendFile('./lecturas.json', cadena, function(err) {
                    if( err ){
                        console.log( err );
                    }
                });
            }
            //vaciar el buffer del puerto  sp.flush(function(err,results){});
            sp.flush(function(err,results){});
        }
    }

    //-----------------------------------VALIDACIONES------------------------------------------//

    socket.on('disconnect', function(){
        //sp.on('close',mostrarPuertoCerrado);
        console.log("Se envia a cerrar el servidor con el cliente");
        arraySerialPort = [];
		//cancelar();
	});

	function validacion(num1,num2){
		var respuesta = false;
		if (numSen1!=num1 || numSen2!=num2) {
			numSen1=num1;
			numSen2=num2;
			respuesta = true;
		};
		return respuesta;
	}

    function validacion2(array){
        if(array != arrayComparaciones){
            return true;
            arrayComparaciones = array;
        }else{
            return false;
        }
    }

	function actualizarSerialPort(){
        var arrayTemp;
		timeIn = setInterval(function(){
			serialport.list(function (err, ports) {
				ports.forEach(function(port) {
                    if(port.manufacturer.toString().toUpperCase().indexOf("ARDUINO")!=-1)
					arraySerialPort.push(port.comName);
				});
			});
            if(arraySerialPort!=arrayTemp){//controlamos para enviar los datos al cliente solo si es necesario
                    socket.emit('lista puertos',arraySerialPort);
                    arrayTemp = arraySerialPort;
				    arraySerialPort = [];
            }
		},50000)
	}


    //-----------------------GESTION DEL TIEMPO DE ENCENDIDO Y APAGADO --------------------------//

	function calcularEventos(){

        console.log("Esta llegando aqui al metodo de calcular Eventos");
        modelo.getEventos(function(error,data){//devuelve un array con los actuadores de la clase consultas.js
		console.log(data.length);
		//var f=new Date();
		datos = data;//asiganamos los datos devueltos al vector datos que esta declarado globalmente
		//console.log(diasSemana[f.getDay()]);
	    });


		for(var i = 0;i<datos.length;i++){
            hoy = new Date();
            dd = hoy.getDate();
            mm = hoy.getMonth()+1; //hoy es 0!
            yyyy = hoy.getFullYear();
            hora = hoy.getHours();
            minutos = hoy.getMinutes();
            segundos = hoy.getSeconds();

	    	if(diasSemana[hoy.getDay()] == datos[i].dia){
			    console.log("Si");

                if(hora>=datos[i].hora_inicio.split(":")[0] && hora <= datos[i].hora_fin.split(":")[0]){

                    console.log(bandera);

                    if(minutos >= datos[i].hora_inicio.split(":")[1]){ //ejeucion normal cuando los minutos estan en la misma hora
                        console.log("entra a minutos");
                        if(bandera==false){
                            InicioTemporizadores(datos[i].ciclo_inicio,datos[i].ciclo_fin,datos[i].tipo_caudal);
                            bandera = true;
                        }
                    }else{//ejecucion cuando los minutos estan atrasados ejemplo hora de inicio eran las 15:00 y node se ejcuto a las 16:00
                        console.log("Se atraso el timer.. actualizando:  "+restarHoras(hora+":"+minutos,datos[i].hora_inicio));
                        if(restarHoras(hora+":"+minutos,datos[i].hora_inicio)<0){
                            if(bandera==false){
                            InicioTemporizadores(datos[i].ciclo_inicio,datos[i].ciclo_fin,datos[i].tipo_caudal);
                            bandera = true;
                            }
                        }
                    }
                    console.log("minutos: "+hoy.getMinutes()+ " > "+datos[i].hora_fin.split(":")[1]+" Y hora: "+hora+" == "+ datos[i].hora_fin.split(":")[0]);
                    if(minutos >= datos[i].hora_fin.split(":")[1] && hora == datos[i].hora_fin.split(":")[0]){//le aumente un mayor igual cuando los minutos maximos sean 59
                        console.log("minutos: "+minutos+ " > "+datos[i].hora_fin.split(":")[1]+" Y hora: "+hora+" == "+ datos[i].hora_fin.split(":")[0]);
                        cancelar();
                        sp.write("C");
                    }

				}else{
					console.log("Nada planeado para este dia");
				}
	    	}
		}
	}


	function InicioTemporizadores(tiempoEncendido,tiempoApagado,tipoCaudal){
		var tEnc = parseInt(tiempoEncendido * 60000);
		var tApa = parseInt(tiempoApagado * 60000);
		administracionTiempo(tApa,tEnc,tipoCaudal);
	}

	function administracionTiempo(tiempoEncendido,tiempoApagado,tipoCaudal){//segundos
		console.log("INGRESO A LA ADMINISTRACION DEL TIEMPO");
		timout=setTimeout(function(){
	    	sp.write(tipoCaudal);
	    	console.log("Escribo: "+tipoCaudal);
	    	tApagado(tiempoEncendido,tiempoApagado,tipoCaudal);
	    },tiempoEncendido);
	}

	function tApagado(tiempoEncendido,tiempoApagado,tipoCaudal){
		timout=setTimeout(function(){
	    	sp.write("C");
	    	console.log("Escribo C");
	    	administracionTiempo(tiempoEncendido,tiempoApagado,tipoCaudal);
	    },tiempoApagado);
	}
	
	function cancelar(){
		console.log("Timmers desabilitados: no hay nada planificado");
	    clearTimeout(timout);
		clearTimeout(timeIn);
	}


    function restarHoras(inicio,fin) {

        inicioMinutos = parseInt(inicio.substr(3,2));
        inicioHoras = parseInt(inicio.substr(0,2));

        finMinutos = parseInt(fin.substr(3,2));
        finHoras = parseInt(fin.substr(0,2));

        transcurridoMinutos = finMinutos - inicioMinutos;
        transcurridoHoras = finHoras - inicioHoras;

        if (transcurridoMinutos < 0) {
            transcurridoHoras--;
            transcurridoMinutos = 60 + transcurridoMinutos;
        }

        horas = transcurridoHoras.toString();
        minutos = transcurridoMinutos.toString();

        if (horas.length < 2) {
            horas = "0"+horas;
        }

        if (horas.length < 2) {
            horas = "0"+horas;
        }

        return horas;
    }

//---------------------------------ADMINISTRACION DEL SISTEMA------------------------------------//

    function cerrarPuerto(){
        sp.on('close',mostrarPuertoCerrado);
    }

    function mostrarPuertoCerrado(){
        console.log('Puerto cerrado');
    }

    function cerrarTimmers(){
        cancelar();
    }

    function IniciarSoloTimmers(){//iniciar los timmers sin depender del metodo onData
        setInterval(function(){
			calcularEventos();
		},10000)
    }

    function iniciarManualRiego(tipoCaudal){
        sp.write(tipoCaudal);
    }

    function detenerManualRiego(tipoCaudal){
        sp.write("C");
    }

    function alertas(vectorDatos, callback){
        var arrayTemporal = vectorDatos;

        //realizar la consulta de los datos para saber cuales son los maximos aceptables

        //------------------------------------------------------------------------------

        for (var i = 0; i < arrayTemporal.length; i++) {
            arrayTemporal[i] = parseInt(arrayTemporal[i]);
        };
        
        //realizar las preguntas y enviar activar los actuadores si es necesario

        //------------------------------------------------------------------------------

        callback(true);
    }

});

