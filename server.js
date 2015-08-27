
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
var fs = require('fs')
  , Log = require('log')
  , log = new Log('debug', fs.createWriteStream('logsEventos.log'))
  , logNode = new Log('debug', fs.createWriteStream('logsNodeJS'));

/*CREACION DE VARIABLES GLOBALES*/

//var puerto;
var sp;//variable donde se instanciara temporalmente el puerto serial para poder administrarlo
var timout;//controloar los tiempos de intervalo de encendido y apagado de las bonbas de agua en este caso
var timeIn;

var tiempo;//timer global

//creacion de variables globales

var numSen1,numSen2;//numeros que se reciven del sensor 1 y 2 para parsear y evitar errores
var arrayComparaciones; // array que hara las comparaciones de los datos anteriores obtenidos de las medidas

var diasSemana = new Array("Domingo","Lunes","Martes","Miercoles","Jueves","Viernes","Sabado");//vector para calcular los dias de la semana
var datos;//vector donde se van a guardar los resultados de los dias y las horas qye se efectuaran los actuadores
var arraySerialPort = new Array();//vector donde se guardaran los conectores de los puertos seriales disponibles
var puertoAct;//alamacena el puerto actual para realizar la conexion por ese puerto
var idParcela;


var hoy;
var dd;
var mm; //hoy es 0!
var yyyy;
var hora;
var minutos;
var segundos;
var bandera = false;
var modoManualActivado = false;
//Iniciamos el objeto de conexion
io.on('connection',function(socket){

	console.log("Si esta conectando");
    logNode.debug("Se realizo la conexion del cliente con el servidor");

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
        logsNodeJS.debug('Estableciendo conexion con el cliente con el puerto: '+data);
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
        logNode.debug('Se conecto exitosamente al puerto');
        console.log("Se conecto al puerto: "+puertoAct);
        console.log("Esperando datos....");
        logNode.debug('Reciviendo medidas de los sensores');
        logNode.debug('Inicio de peticiones a la base de datos para comprobar si hay evetos pendientes');
        if(modoManualActivado==false){
            IniciarSoloTimmers();
        }
    }


    //---------------------------RECIVIENDO LOS DATOS DEL PUERTO---------------------------//

    function onData(data){
        console.log(data);
        var com = parseInt(data);
        if(com == 1011010) {
            logNode.debug('Confirmacion recivida del sensor de la parcela');
            console.log("Confirmacion recivida");
            sp.write("S");
        }else{
            console.log(data.split(";")); //debug :v
            var vectorDatos=data.split(";");
            var sen1 = parseInt(vectorDatos[0]);
            var sen2 = parseInt(vectorDatos[1]);

            io.emit("obtener medidas",vectorDatos);

            logNode.debug('Eviando a preguntar si hay alertas');
            //llamar al metodo de alertas e inicio del riego automatico si tubuiera q ser asi
            alertas(vectorDatos);
            //-------------------------------------------------------------------------------

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
                    cadena+='"sensor_"'+(i+1)+':'+vectorDatos[i]+',\n';
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
        logNode.debug('se cerro la conexion con el cliente');
		//cancelar();
	});

    socket.on('obtener parcela',function(data){
        idParcela = data;
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


    //-----------------------GESTION DEL TIEMPO DE ENCENDIDO Y APAGADO DE LOS SENSORES-------------------------------//

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
            logsEventos.debug('Se envio a escribir en el sensor: '+tipoCaudal);
	    	console.log("Escribo: "+tipoCaudal);
	    	tApagado(tiempoEncendido,tiempoApagado,tipoCaudal);
	    },tiempoEncendido);
	}

	function tApagado(tiempoEncendido,tiempoApagado,tipoCaudal){
		timout=setTimeout(function(){
	    	sp.write("C");
            logsEventos.debug('Se envio a escribir en el sensor: C');
	    	console.log("Escribo C");
	    	administracionTiempo(tiempoEncendido,tiempoApagado,tipoCaudal);
	    },tiempoApagado);
	}
	
	function cancelar(){
		console.log("Timmers desabilitados: no hay nada planificado");
        logNode.debug('Timers desabilitados');
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

//--------------------------------GESTIONAR EL ENCENDIDO Y APAGADO DEL FOCO-----------------------------------------//

socket.on('Encender',function(){
    sp.write("F");
});

socket.of('Apagado',function(){
    sp.write("D");
});

//---------------------------------ADMINISTRACION DEL SISTEMA------------------------------------------------------//

    function cerrarPuerto(){
        sp.on('close',mostrarPuertoCerrado);
        logNode.debug('Se cerro la conexion con el puerto');
    }

    function mostrarPuertoCerrado(){
        console.log('Puerto cerrado');
    }

    function cerrarTimmers(){
        cancelar();
    }

    function IniciarSoloTimmers(){//iniciar los timmers sin depender del metodo onData
        logNode.debug('Inicio de la function para calcular eventos en los sensores');
        tiempo = setInterval(function(){
			calcularEventos();
		},10000)
        modoManualActivado = false;
    }

    function iniciarManualRiego(tipoCaudal){
        logsEventos.info('Se envio manualmente al sensor: '+tipoCaudal);
        sp.write(tipoCaudal);
    }

    function detenerManualRiego(tipoCaudal){
        logsEventos.info('Se detubo manualmente el sensor');
        sp.write("C");
    }

    function modoManual(){
        console.log("Timmers desabilitados: Modo Manual Activado!");
        logsEventos.info('Modo manual activado');
        clearTimeout(timout);
        clearTimeout(timeIn);
        clearTimeout(tiempo);
        modoManualActivado = true;
    }

    function alertas(vectorDatos){
        var arrayTemporal = vectorDatos;
        var datosMinMax;
        var alerta = 0;
        //realizar la consulta de los datos para saber cuales son los maximos aceptables

        modelo.getMedidasMinMax(function(idParcela,data){//devuelve un array con los actuadores de la clase consultas.js
                datosMinMax = datos;
        });

        for (var i = 0; i < arrayTemporal.length; i++) {
            arrayTemporal[i] = parseInt(arrayTemporal[i]);
        };

        if(datosMinMax.length == arrayTemporal.length){

            for (var i = 0; i < arrayTemporal.length; i++) {
                if (arrayTemporal[i] < parseInt(datosMinMax[i].medida_min)) {
                    
                    alerta = alerta + 1;
                    if(alerta == 15){
                        //agregar un contador cada cuanto pasa esto y si es una x cantidad de tiempo, ahi mandar a apagar las bombas
                        modoManual();
                        socket.emit('mensaje',""+datosMinMax[i].tipo_sensor+" bajo de los niveles recomendados!");
                        logsEventos.warning(datosMinMax[i].tipo_sensor+'Bajo de los niveles recomendados!');
                        alerta = 0;
                    }

                }else if (arrayTemporal[i] > parseInt(datosMinMax[i].medida_max)){

                    alerta = alerta + 1;
                    if(alerta == 15){
                        modoManual();
                        socket.emit('mensaje',""+datosMinMax[i].tipo_sensor+" sobre los niveles recomendados!");
                        logsEventos.warning(datosMinMax[i].tipo_sensor+'Sobre los niveles recomendados!');
                        alerta = 0;
                    }
                }else{
                    //estado normal de las medidas.
                    alerta = 0;
                    logsEventos.info('Medidas en estado normal del sensor: '+datosMinMax[i].tipo_sensor);
                }
            }
        }else{
            console.log('Error: Incongruencia en los datos recividos con los sensores registrados en su base de datos.');
            logsEventos.error('Incongruencia en los datos recividos con los sensores registrados en su base de datos.');
        }
    }
});

