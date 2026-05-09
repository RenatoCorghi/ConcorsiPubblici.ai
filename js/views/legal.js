/* ============================================================
   LEGAL.JS — Vista per Termini d'Uso, Privacy e Cookie Policy
   ============================================================ */

export function renderLegal() {
    return `
        <div class="fade-in max-w-4xl mx-auto pb-12">
            <h1 class="text-4xl font-display font-bold text-white mb-2">Legal & Privacy</h1>
            <p class="text-gray-400 mb-8 border-b border-gray-800 pb-8">Termini di Servizio, Informativa Privacy e Cookie Policy della piattaforma ConcorsiPubblici.ai.</p>
            
            <div class="space-y-12">
                <section>
                    <h2 class="text-2xl font-bold text-gray-200 mb-4 flex items-center gap-2"><i data-lucide="shield-check" class="text-magis-400"></i> Informativa Privacy (GDPR)</h2>
                    <div class="prose prose-invert prose-gray max-w-none text-gray-400 leading-relaxed text-sm">
                        <p>Ai sensi del Regolamento (UE) 2016/679 (GDPR), ti informiamo che ConcorsiPubblici.ai raccoglie e processa i dati generati tramite la piattaforma (tra cui testi redatti durante le simulazioni e relative metriche di valutazione) al fine esclusivo di erogare il servizio di tutoraggio e correzione tramite intelligenza artificiale.</p>
                        
                        <h4 class="text-gray-300 font-bold mt-4 mb-2">1. Titolare del Trattamento</h4>
                        <p>Il Titolare del trattamento è ConcorsiPubblici.ai. Per qualsiasi richiesta relativa ai tuoi dati personali, puoi scrivere a <a href="mailto:privacy@concorsipubblici.ai" class="text-magis-400 hover:text-magis-300 transition">privacy@concorsipubblici.ai</a>.</p>

                        <h4 class="text-gray-300 font-bold mt-4 mb-2">2. Elaborazione Dati (OpenAI)</h4>
                        <p>I testi delle simulazioni inserite volontariamente vengono inviati ai server OpenAI per l'elaborazione del voto. I dati inviati tramite l'infrastruttura API non verranno utilizzati da OpenAI per addestrare modelli linguistici pubblici. Non includere dati personali (nomi, indirizzi) all'interno dei testi delle simulazioni giuridiche.</p>
                        
                        <h4 class="text-gray-300 font-bold mt-4 mb-2">3. Archiviazione Locale & Cloud</h4>
                        <p>Le statistiche di progresso dell'utente sono conservate primariamente in locale sul browser (LocalStorage) per garantire la privacy. Previo consenso per il servizio cloud (Supabase Auth), i dati verranno sincronizzati su server cloud sicuri gestiti in Europa (AWS Frankfurt, eu-central-1).</p>
                        
                        <h4 class="text-gray-300 font-bold mt-4 mb-2">4. Base Giuridica</h4>
                        <p>La base giuridica del trattamento è il <strong>consenso dell'utente</strong> (Art. 6, par. 1, lett. a, GDPR), espresso al momento della registrazione o dell'accesso come ospite, e <strong>l'esecuzione del contratto</strong> di servizio (Art. 6, par. 1, lett. b, GDPR).</p>

                        <h4 class="text-gray-300 font-bold mt-4 mb-2">5. Diritti dell'interessato</h4>
                        <p>Hai il diritto in qualsiasi momento di:</p>
                        <ul class="list-disc pl-5 mt-2 space-y-1">
                            <li>Richiedere la <strong>cancellazione totale</strong> dei tuoi dati (diritto all'oblio)</li>
                            <li>Richiedere l'<strong>esportazione</strong> dei dati in formato portabile (disponibile nella Dashboard)</li>
                            <li>Richiedere l'<strong>interruzione</strong> della profilazione didattica</li>
                            <li><strong>Revocare</strong> il consenso al trattamento</li>
                        </ul>
                        <p class="mt-2">Per esercitare questi diritti, scrivi a <a href="mailto:privacy@concorsipubblici.ai" class="text-magis-400 hover:text-magis-300 transition">privacy@concorsipubblici.ai</a>.</p>
                    </div>
                </section>

                <section>
                    <h2 class="text-2xl font-bold text-gray-200 mb-4 flex items-center gap-2"><i data-lucide="cookie" class="text-magis-400"></i> Cookie Policy</h2>
                    <div class="prose prose-invert prose-gray max-w-none text-gray-400 leading-relaxed text-sm bg-gray-900/50 p-6 rounded-2xl border border-gray-800">
                        <p>ConcorsiPubblici.ai utilizza esclusivamente <strong>cookie tecnici essenziali</strong> per il funzionamento della piattaforma:</p>
                        
                        <div class="mt-4 overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead>
                                    <tr class="border-b border-gray-700">
                                        <th class="py-2 pr-4 text-gray-300 font-bold">Cookie / Storage</th>
                                        <th class="py-2 pr-4 text-gray-300 font-bold">Tipo</th>
                                        <th class="py-2 pr-4 text-gray-300 font-bold">Finalità</th>
                                        <th class="py-2 text-gray-300 font-bold">Durata</th>
                                    </tr>
                                </thead>
                                <tbody class="text-gray-400">
                                    <tr class="border-b border-gray-800"><td class="py-2 pr-4 font-mono text-xs">localStorage (vari)</td><td class="py-2 pr-4">Tecnico</td><td class="py-2 pr-4">Salvataggio progressi, profilo, bozze</td><td class="py-2">Persistente</td></tr>
                                    <tr class="border-b border-gray-800"><td class="py-2 pr-4 font-mono text-xs">concorsi_cookie_consent</td><td class="py-2 pr-4">Tecnico</td><td class="py-2 pr-4">Memorizzazione accettazione cookie</td><td class="py-2">Persistente</td></tr>
                                    <tr class="border-b border-gray-800"><td class="py-2 pr-4 font-mono text-xs">sb-* (Supabase)</td><td class="py-2 pr-4">Tecnico</td><td class="py-2 pr-4">Sessione di autenticazione (solo se login)</td><td class="py-2">Sessione</td></tr>
                                    <tr><td class="py-2 pr-4 font-mono text-xs">Service Worker Cache</td><td class="py-2 pr-4">Tecnico</td><td class="py-2 pr-4">Funzionamento offline della PWA</td><td class="py-2">Fino ad aggiornamento</td></tr>
                                </tbody>
                            </table>
                        </div>
                        
                        <p class="mt-4"><strong>Cookie di terze parti:</strong> non utilizziamo cookie di profilazione, marketing, né servizi di analytics di terze parti. I font Google (Inter, Outfit) vengono caricati via CDN senza tracciamento utente.</p>
                        
                        <p class="mt-2">Puoi revocare il consenso ai cookie in qualsiasi momento eliminando i dati del sito dalle impostazioni del tuo browser, o utilizzando il pulsante "Reset & Ripara" nella schermata di errore dell'applicazione.</p>
                    </div>
                </section>

                <section>
                    <h2 class="text-2xl font-bold text-gray-200 mb-4 flex items-center gap-2"><i data-lucide="scale" class="text-magis-400"></i> Termini e Condizioni di Servizio</h2>
                    <div class="prose prose-invert prose-gray max-w-none text-gray-400 leading-relaxed text-sm bg-gray-900/50 p-6 rounded-2xl border border-gray-800">
                        <p>L'utilizzo di ConcorsiPubblici.ai costituisce accettazione dei seguenti termini:</p>
                        <ul class="list-disc pl-5 mt-4 space-y-2">
                            <li><strong class="text-magis-400">FASE BETA:</strong> La piattaforma è attualmente rilasciata in versione Beta. Le funzionalità, le prestazioni dei modelli AI e l'interfaccia potrebbero subire modifiche. L'utente riconosce e accetta la natura sperimentale del servizio.</li>
                            <li>La piattaforma eroga valutazioni generate da Intelligenza Artificiale (LLM) su materie giuridiche. Nonostante l'alto livello di precisione della struttura di knowledge-base (CiceroAI Expert System), i feedback, i voti e le argomentazioni <strong>non sostituiscono un parere legale o accademico vincolante</strong>.</li>
                            <li>L'Utente è responsabile dell'attendibilità accademica con cui interpreta e studia i consigli forniti dal Phantom Tutor e dal Pannello di Correzione.</li>
                            <li>Sui piani in abbonamento, si applica la normativa di recesso entro 14 giorni solo se il servizio (simulazioni conteggiate tramite i crediti) non è stato ampiamente consumato.</li>
                            <li>La piattaforma è fornita "così com'è" (<em>as-is</em>). Non garantiamo la disponibilità continua del servizio né l'assenza di errori nei contenuti generati dall'AI.</li>
                            <li>L'utente si impegna a non abusare dell'API, non inviare contenuti illegali, e a non tentare di eludere le misure di sicurezza della piattaforma.</li>
                        </ul>
                    </div>
                </section>
                
                <section>
                    <h2 class="text-2xl font-bold text-gray-200 mb-4 flex items-center gap-2"><i data-lucide="mail" class="text-magis-400"></i> Contatti</h2>
                    <div class="prose prose-invert prose-gray max-w-none text-gray-400 leading-relaxed text-sm">
                        <p>Per qualsiasi richiesta relativa a privacy, dati personali, o termini di servizio:</p>
                        <ul class="list-none pl-0 mt-3 space-y-2">
                            <li class="flex items-center gap-2"><i data-lucide="mail" class="w-4 h-4 text-magis-400"></i> <a href="mailto:info@concorsipubblici.ai" class="text-magis-400 hover:text-magis-300 transition">info@concorsipubblici.ai</a></li>
                            <li class="flex items-center gap-2"><i data-lucide="shield" class="w-4 h-4 text-magis-400"></i> <a href="mailto:privacy@concorsipubblici.ai" class="text-magis-400 hover:text-magis-300 transition">privacy@concorsipubblici.ai</a> (DPO)</li>
                        </ul>
                    </div>
                </section>
            </div>
            
            <div class="mt-12 text-center text-xs text-gray-600">
                <p>Ultimo aggiornamento: Aprile 2026</p>
            </div>
            <div class="mt-4 text-center">
                <button onclick="app.navigate('home')" class="px-6 py-2 rounded-full border border-gray-700 hover:bg-gray-800 text-gray-400 transition font-medium text-sm">Torna alla Dashboard</button>
            </div>
        </div>
    `;
}
