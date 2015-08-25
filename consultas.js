var sqlite3 = require('sqlite3').verbose(),//necesario para utilizar sqlite3
db = new sqlite3.Database('../dbdyuyay'),//creamos la base de datos llamada blogNode si no existe
modelo = {};//objeto para exportar y manejar la información del modelo

modelo.getPuerto = function(){//callback
	db.all("SELECT puerto_com FROM appAdministrativa_nodo WHERE id = '1'",function(err,rows){
		if(err){
			throw err;
		}else{
			callback(null,rows);
		}
	});
}

modelo.getEventos = function(callback)
{
    db.all("SELECT * FROM appAdministrativa_programador_eventos", function(err, rows) 
    {
        if(err)
        {
            throw err;
        }
        else
        {
            callback(null, rows);
        }
    });
}

modelo.getTipoSensor = function(callback)
{
    db.all("SELECT id,tipo_sensor FROM appAdministrativa_sensor WHERE id IN (SELECT id_sensor_id FROM appAdministrativa_node_sensor WHERE id_nodo_id IN (SELECT id FROM appAdministrativa_nodo WHERE tipo_nodo = 'final'))",function(err,rows)
    {
        if(err)
        {
            throw err;
        }else
        {
            callback(null,rows);
        }
    });
}

modelo.getIdNodoSensor = function(callback,idSensor){
    db.all('SELECT id as id_nodo_sensor FROM appAdministrativa_node_sensor WHERE id_nodo_id = \''+idSensor+'\') ',function(err, rows)
    {
        if(err)
        {
            throw err;
        }else{
            callback(null,rows);
        }
    })
}


//debemos escribir esta linea para poder utilizar el modelo
module.exports = modelo;
