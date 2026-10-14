const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS y parseo de JSON
app.use(cors());
app.use(express.json());

// Configurar Mercado Pago con tu Access Token
// (Asegurate de agregar MERCADOPAGO_ACCESS_TOKEN en las Variables de Entorno de Render)
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TU_ACCESS_TOKEN_AQUI' 
});

// Ruta de prueba para verificar que el backend funciona
app.get('/', (req, res) => {
    res.send('Servidor del Truco funcionando correctamente.');
});

// Ruta para crear la preferencia de pago en Mercado Pago
app.post('/crear-preferencia', async (req, res) => {
    try {
        const { cantidad } = req.body;
        const monto = Number(cantidad) || 500;

        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: [
                    {
                        title: 'Fichas Truco Argentino',
                        quantity: 1,
                        unit_price: monto,
                        currency_id: 'ARS'
                    }
                ],
                back_urls: {
                    success: 'https://tu-frontend.netlify.app',
                    failure: 'https://tu-frontend.netlify.app',
                    pending: 'https://tu-frontend.netlify.app'
                },
                auto_return: 'approved'
            }
        });

        // Devolver el link de pago (init_point) al frontend
        res.json({ init_point: result.init_point });
    } catch (error) {
        console.error('Error al crear la preferencia de Mercado Pago:', error);
        res.status(500).json({ error: 'No se pudo generar la preferencia de pago.' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});