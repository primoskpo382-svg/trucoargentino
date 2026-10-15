const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Configuración de Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN || 'TU_ACCESS_TOKEN_DE_PRUEBA_LOCAL' 
});

// Configuración de Supabase para el backend
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://olvieohhsybycmyojdpo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_sBg5zRa3r3FS1pJGC5IwNg_Ca4Gy5An';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FICHAS_INICIALES = 10000;

app.get('/', (req, res) => {
    res.send('¡Servidor Backend de Truco Argentino funcionando con éxito!');
});

// Endpoint para consultar saldo u obtener usuario con 10,000 fichas iniciales si es nuevo
app.post('/obtener-usuario', async (req, res) => {
    try {
        const { usuarioId, email } = req.body;
        if (!usuarioId) return res.status(400).json({ error: 'Falta usuarioId' });

        const { data: userData, error } = await supabase
            .from('perfiles')
            .select('*')
            .eq('usuarios', usuarioId)
            .single();

        if (userData) {
            return res.json(userData);
        } else {
            const { data: nuevoUsuario, error: createError } = await supabase
                .from('perfiles')
                .upsert([{ 
                    usuarios: usuarioId, 
                    email: email || `${usuarioId}@jugador.com`, 
                    fichas: FICHAS_INICIALES 
                }])
                .select()
                .single();

            if (createError) {
                console.error("Error al crear perfil nuevo:", createError);
                return res.status(500).json({ error: createError.message });
            }
            return res.json(nuevoUsuario);
        }
    } catch (err) {
        console.error("Error en /obtener-usuario:", err);
        res.status(500).json({ error: err.message });
    }
});

// NUEVO: Endpoint para partidas de 0 fichas o modo gratuito
const jugarGratisHandler = async (req, res) => {
    try {
        const { usuarioId } = req.body;
        if (!usuarioId) return res.status(400).json({ error: 'Falta usuarioId' });

        // Permitir jugar por 0 fichas validando que el usuario exista
        const { data: userData, error } = await supabase
            .from('perfiles')
            .select('*')
            .eq('usuarios', usuarioId)
            .single();

        if (!userData) {
            // Si no existe, lo creamos con las 10000 iniciales por defecto
            await supabase.from('perfiles').upsert([{ usuarios: usuarioId, fichas: FICHAS_INICIALES }]);
        }

        return res.json({ 
            exito: true, 
            mensaje: 'Partida iniciada por 0 fichas (Modo gratuito)',
            costo: 0 
        });
    } catch (err) {
        console.error("Error en /jugar-gratis:", err);
        res.status(500).json({ error: err.message });
    }
};

app.post('/jugar-gratis', jugarGratisHandler);
app.post('/api/jugar-gratis', jugarGratisHandler);

const crearPreferenciaHandler = async (req, res) => {
    try {
        const cantidad = Number(req.body.cantidad || req.body.fichas || 1000);
        const PRECIO_POR_FICHA = 1; 
        const precioUnitario = Number(req.body.precio || req.body.price || req.body.monto || PRECIO_POR_FICHA);
        const precioTotal = precioUnitario * (req.body.precio ? 1 : cantidad);
        const usuarioId = req.body.usuarioId || req.body.user || 'demo_user';

        const preference = new Preference(client);

        const resultado = await preference.create({
            body: {
                items: [
                    {
                        title: `${cantidad} Ficha(s) de Truco Argentino`,
                        quantity: 1,
                        unit_price: precioTotal > 0 ? precioTotal : cantidad * PRECIO_POR_FICHA,
                        currency_id: 'ARS'
                    }
                ],
                back_urls: {
                    success: 'https://app.netlify.com',
                    failure: 'https://app.netlify.com',
                    pending: 'https://app.netlify.com'
                },
                auto_return: 'approved',
                external_reference: String(usuarioId)
            }
        });

        res.json({ init_point: resultado.init_point });

    } catch (error) {
        console.error('Error al crear preferencia de Mercado Pago:', error);
        res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
};

app.post('/crear-preferencia', crearPreferenciaHandler);
app.post('/api/crear-preferencia', crearPreferenciaHandler);

// WEBHOOK DE MERCADO PAGO CORREGIDO (Evita acreditar 0 fichas)
const webhookHandler = async (req, res) => {
    try {
        const body = req.body;
        let paymentId = null;
        if (body.type === 'payment' && body.data && body.data.id) {
            paymentId = body.data.id;
        } else if (body.id && body.topic === 'payment') {
            paymentId = body.id;
        } else if (req.query && req.query['data.id']) {
            paymentId = req.query['data.id'];
        }

        if (paymentId) {
            const payment = new Payment(client);
            const paymentData = await payment.get({ id: paymentId });

            if (paymentData.status === 'approved') {
                const usuarioId = paymentData.external_reference;
                
                let fichasCompradas = 0;
                if (paymentData.additional_info && paymentData.additional_info.items && paymentData.additional_info.items.length > 0) {
                    const title = paymentData.additional_info.items[0].title;
                    const match = title.match(/(\d+)/);
                    if (match) fichasCompradas = Number(match[1]);
                }
                
                // Fallback seguro: si el título no trae número, usa el monto o asigna un mínimo garantizado
                if (!fichasCompradas || fichasCompradas <= 0) {
                    const montoPagado = Number(paymentData.transaction_amount || 0);
                    fichasCompradas = montoPagado > 0 ? montoPagado : 1000;
                }

                if (usuarioId && usuarioId !== 'demo_user' && fichasCompradas > 0) {
                    const { data: userData } = await supabase
                        .from('perfiles')
                        .select('fichas')
                        .eq('usuarios', usuarioId)
                        .single();

                    let saldoActual = userData ? (userData.fichas !== undefined ? userData.fichas : FICHAS_INICIALES) : FICHAS_INICIALES;
                    const nuevoSaldo = saldoActual + fichasCompradas;

                    const { error: updateError } = await supabase
                        .from('perfiles')
                        .upsert([{ usuarios: usuarioId, fichas: nuevoSaldo }]);

                    if (updateError) {
                        console.error("Error al actualizar fichas en Supabase:", updateError);
                    } else {
                        console.log(`¡Éxito! Se acreditaron ${fichasCompradas} fichas al usuario ${usuarioId}. Nuevo saldo: ${nuevoSaldo}`);
                    }
                }
            }
        }

        return res.status(200).send('OK');
    } catch (error) {
        console.error('Error procesando webhook de MP:', error);
        return res.status(200).send('OK');
    }
};

app.post('/webhook', webhookHandler);
app.post('/api/webhook', webhookHandler);

app.get('/webhook', (req, res) => {
    res.status(200).send('Endpoint de Webhook activo y operativo');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Truco corriendo en el puerto ${PORT}`);
});