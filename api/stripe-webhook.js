import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Assicurati di impostare queste variabili su Vercel:
// - STRIPE_SECRET_KEY
// - STRIPE_WEBHOOK_SECRET
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseUrl = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const config = {
  api: {
    bodyParser: false, // Disabilita il body parser per avere il raw body richiesto da Stripe
  },
};

const getRawBody = async (req) => {
    return new Promise((resolve, reject) => {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => resolve(Buffer.concat(body)));
        req.on('error', err => reject(err));
    });
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('[Stripe Webhook] Errore di configurazione: manca STRIPE_WEBHOOK_SECRET');
        return res.status(500).json({ error: 'Server Missconfiguration' });
    }

    let event;
    try {
        const rawBody = await getRawBody(req);
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        console.error(`[Stripe Webhook] Errore Signature: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[Stripe Webhook] Ricevuto Evento: ${event.type}`);

    // Gestione dell'evento di completamento pagamento.
    // checkout.session.completed può arrivare con payment_status 'unpaid' per metodi
    // asincroni (SEPA, bonifico): in quel caso si attende async_payment_succeeded.
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object;

        // Questo è lo user.id inviato tramite il Parametro 'client_reference_id' nel Link Stripe
        const userId = session.client_reference_id;
        const stripeCustomerId = session.customer;

        if (session.payment_status !== 'paid') {
            console.log(`[Stripe Webhook] Sessione ${session.id} non ancora pagata (payment_status: ${session.payment_status}). Attendo conferma asincrona.`);
        } else if (!userId) {
            console.warn('[Stripe Webhook] Nessun client_reference_id passato nella sessione. Impossibile associare l\'utente.');
        } else {
            // Aggiorna il profilo Supabase usando le Service Keys (bypassa RLS)
            const { error } = await supabase
                .from('profiles')
                .update({ 
                    tier: 'Pro',
                    stripe_customer_id: stripeCustomerId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (error) {
                console.error('[Stripe Webhook] Errore Database Update:', error);
                return res.status(500).json({ error: 'Database update failed' });
            }
            
            console.log(`[Stripe Webhook] Utente ${userId} promosso al tier PRO con successo.`);
        }
    } 
    
    // Annullamento o scadenza abbonamento
    else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;

        // Trova l'utente tramite il suo stripe_customer_id per fare downgrade a Free
        const { data: users, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', stripeCustomerId);

        if (!selectError && users && users.length > 0) {
            const userId = users[0].id;
            
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                    tier: 'Free',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (!updateError) {
                console.log(`[Stripe Webhook] Utente ${userId} retrocesso al tier FREE a causa cancellazione subscription.`);
            }
        }
    }

    res.status(200).json({ received: true });
}
