const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();

// Habilitar CORS para permitir solicitudes desde cualquier frontend (Netlify, etc.)
app.use(cors({ origin: '*' }));
app.use(express.json());

// Configurar Mercado Pago utilizando la variable de entorno de Render (MP_ACCESS_TOKEN)
const client = new MercadoPagoConfig({ 
    accessKey: process.env.MP_ACCESS_TOKEN || 'TU_ACCESS_TOKEN_DE_PRUEBA_LOCAL' 
});

// Ruta raíz de prueba para verificar que el servidor está online
app.get('/', (req, res) => {
    res.send('¡Servidor Backend de Truco Argentino funcionando con éxito!');
});

// Endpoint para crear la preferencia de pago para comprar fichas
app.post('/api/crear-preferencia', async (req, res) => {
    try {
        const { precio, cantidad, usuarioId } = req.body;

        if (!precio || precio <= 0) {
            return res.status(400).json({ error: 'Precio inválido' });
        }

        const preference = new Preference(client);

        const resultado = await preference.create({
            body: {
                items: [
                    {
                        title: `${cantidad || 1} Fichas de Truco Argentino`,
                        quantity: Number(cantidad || 1),
                        unit_price: Number(precio),
                        currency_id: 'ARS'
                    }
                ],
                back_urls: {
                    success: 'https://app.netlify.com', // O la URL definitiva de tu web en Netlify
                    failure: 'https://app.netlify.com',
                    pending: 'https://app.netlify.com'
                },
                auto_return: 'approved',
                external_reference: usuarioId || 'demo_user'
            }
        });

        // Retornamos el link de pago (init_point) hacia el cliente
        res.json({ init_point: resultado.init_point });

    } catch (error) {
        console.error('Error al crear preferencia de Mercado Pago:', error);
        res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
});

// Endpoint para procesar solicitudes de retiro de fichas
app.post('/api/solicitar-retiro', async (req, res) => {
    try {
        const { usuarioId, fichasARetirar, aliasCbu } = req.body;

        if (!fichasARetirar || !aliasCbu) {
            return res.status(400).json({ error: 'Faltan datos para procesar el retiro' });
        }

        // Aquí puedes registrar la solicitud en tu base de datos o lógica interna
        console.log(`Solicitud de retiro de ${fichasARetirar} fichas para usuario ${usuarioId} a la cuenta/alias: ${aliasCbu}`);

        res.json({ 
            exito: true, 
            mensaje: '¡Solicitud de retiro enviada con éxito! Se procesará en las próximas 24 horas.' 
        });

    } catch (error) {
        console.error('Error al solicitar retiro:', error);
        res.status(500).json({ error: 'Error al procesar el retiro' });
    }
});

// Render asigna un puerto automático mediante process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Truco corriendo en el puerto ${PORT}`);
});