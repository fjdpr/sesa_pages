(function () {
    'use strict';

    // ── FAILSAFE: marca que JS cargó correctamente.
    // El CSS oculta .reveal-pending SOLO cuando .js-loaded está en <html>.
    // Si este script falla antes de DOMContentLoaded, nada queda oculto.
    document.documentElement.classList.add('js-loaded');

    // ── Debug: actívalo con ?debug=1 en la URL o window.SESADebug.enable()
    var params = new URLSearchParams(window.location.search);
    var isDebug = params.get('debug') === '1' || localStorage.getItem('sesaDebug') === '1';

    function log() {
        if (!isDebug) { return; }
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[SESA]');
        console.log.apply(console, args);
    }

    window.SESADebug = {
        enable: function () { localStorage.setItem('sesaDebug', '1'); location.reload(); },
        disable: function () { localStorage.removeItem('sesaDebug'); location.reload(); },
    };

    // ── Modal: abre y cierra el overlay de confirmación
    function abrirModal() {
        var overlay = document.getElementById('modal-ok');
        if (!overlay) { return; }
        overlay.classList.add('is-open');
        // Foco en el botón cerrar para accesibilidad
        var btnCerrar = document.getElementById('modal-close');
        if (btnCerrar) { setTimeout(function () { btnCerrar.focus(); }, 50); }
    }

    function cerrarModal() {
        var overlay = document.getElementById('modal-ok');
        if (!overlay) { return; }
        overlay.classList.remove('is-open');
        // Devuelve foco al botón de envío
        var btnEnvio = document.getElementById('form-submit-btn');
        if (btnEnvio) { btnEnvio.focus(); btnEnvio.disabled = false; btnEnvio.textContent = 'Enviar mensaje'; }
    }

    function enviarConTimeout(url, options, timeoutMs) {
        if (!('AbortController' in window)) {
            return fetch(url, options);
        }

        var controller = new AbortController();
        var timeoutId = setTimeout(function () {
            controller.abort();
        }, timeoutMs);

        options.signal = controller.signal;

        return fetch(url, options)
            .then(function (res) {
                clearTimeout(timeoutId);
                return res;
            })
            .catch(function (err) {
                clearTimeout(timeoutId);
                throw err;
            });
    }

    function normalizarEspacios(valor) {
        return String(valor || '').replace(/\s+/g, ' ').trim();
    }

    function validarCorreoRobusto(email) {
        var value = normalizarEspacios(email).toLowerCase();

        // Formato estricto con al menos un subdominio y TLD real.
        var emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
        if (!emailRegex.test(value)) { return false; }

        var parts = value.split('@');
        if (parts.length !== 2) { return false; }
        var local = parts[0];
        var domain = parts[1];
        var labels = domain.split('.');
        var firstLabel = labels[0] || '';
        var tld = labels[labels.length - 1] || '';

        // Bloquea casos demasiado cortos o típicos de prueba.
        if (local.length < 2) { return false; }
        if (firstLabel.length < 2) { return false; }
        if (tld.length < 2) { return false; }

        var correosBloqueados = {
            'a@a.com': true,
            'test@test.com': true,
            'example@example.com': true,
            'correo@correo.com': true,
            'prueba@prueba.com': true
        };

        if (correosBloqueados[value]) { return false; }

        if (/^(test|prueba|correo|email|mail|usuario|user)\d*$/i.test(local)) { return false; }

        var dominiosPlaceholder = {
            'example.com': true,
            'example.org': true,
            'example.net': true,
            'test.com': true,
            'correo.com': true,
            'prueba.com': true
        };

        if (dominiosPlaceholder[domain]) { return false; }

        return true;
    }

    function validarFormularioContacto(form) {
        var nombre = form.querySelector('#nombre');
        var email = form.querySelector('#email');
        var asunto = form.querySelector('#asunto');
        var mensaje = form.querySelector('#mensaje');
        var honey = form.querySelector('input[name="_honey"]');

        if (honey && normalizarEspacios(honey.value) !== '') {
            return { valido: false, campo: honey, mensaje: 'No se pudo procesar el envio.' };
        }

        if (!nombre || !email || !asunto || !mensaje) {
            return { valido: false, campo: null, mensaje: 'No se pudo validar el formulario completo.' };
        }

        nombre.value = normalizarEspacios(nombre.value);
        email.value = normalizarEspacios(email.value);
        asunto.value = normalizarEspacios(asunto.value);
        mensaje.value = String(mensaje.value || '').trim();

        if (nombre.value.length < 2) {
            return { valido: false, campo: nombre, mensaje: 'Escribe tu nombre completo.' };
        }

        if (asunto.value.length < 3) {
            return { valido: false, campo: asunto, mensaje: 'El asunto debe tener al menos 3 caracteres.' };
        }

        if (mensaje.value.length < 10) {
            return { valido: false, campo: mensaje, mensaje: 'El mensaje debe tener al menos 10 caracteres.' };
        }

        if (!validarCorreoRobusto(email.value)) {
            return { valido: false, campo: email, mensaje: 'Ingresa un correo real y valido.' };
        }

        // Candado anti-bot basico: evita envios instantaneos automatizados.
        var startedAt = Number(form.getAttribute('data-started-at') || '0');
        if (startedAt > 0 && (Date.now() - startedAt) < 2500) {
            return { valido: false, campo: null, mensaje: 'Espera un momento y vuelve a intentar.' };
        }

        return { valido: true };
    }

    function limpiarErroresPersonalizados(form) {
        var campos = form.querySelectorAll('input, textarea');
        campos.forEach(function (campo) {
            campo.setCustomValidity('');
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var pageName = document.body.getAttribute('data-page') || 'desconocida';
        log('Pagina:', pageName);

        // ── Reveal al scroll ─────────────────────────────────────────────────
        // Añade clases para la animación de entrada; el CSS las gestiona.
        var revealTargets = document.querySelectorAll('.hero-content, .hero-form-wrapper, .contact-card');

        revealTargets.forEach(function (el) {
            el.classList.add('reveal-item', 'reveal-pending');
        });

        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.remove('reveal-pending');
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.05, rootMargin: '0px 0px -10px 0px' });

            revealTargets.forEach(function (el) { observer.observe(el); });
        } else {
            // Navegador sin IntersectionObserver: muestra todo directamente
            revealTargets.forEach(function (el) {
                el.classList.remove('reveal-pending');
                el.classList.add('is-visible');
            });
        }

        // Failsafe de tiempo: si el observer no disparó en 900ms, muestra todo
        setTimeout(function () {
            revealTargets.forEach(function (el) {
                el.classList.remove('reveal-pending');
                el.classList.add('is-visible');
            });
        }, 900);

        // ── Formulario de contacto ───────────────────────────────────────────
        var form = document.getElementById('contact-form');
        var submitBtn = document.getElementById('form-submit-btn');

        if (form && submitBtn) {
            form.setAttribute('data-started-at', String(Date.now()));

            var camposFormulario = form.querySelectorAll('input, textarea');
            camposFormulario.forEach(function (campo) {
                campo.addEventListener('input', function () {
                    campo.setCustomValidity('');
                });
            });

            form.addEventListener('submit', function (e) {
                e.preventDefault(); // Evita recarga de página

                limpiarErroresPersonalizados(form);

                var validacion = validarFormularioContacto(form);
                if (!validacion.valido) {
                    if (validacion.campo && validacion.campo.setCustomValidity) {
                        validacion.campo.setCustomValidity(validacion.mensaje || 'Campo invalido.');
                        validacion.campo.reportValidity();
                        validacion.campo.focus();
                    } else {
                        window.alert(validacion.mensaje || 'No se pudo enviar el formulario.');
                    }
                    return;
                }

                // Fuerza validación HTML5 antes de intentar envío AJAX.
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                // Deshabilita botón mientras se envía
                submitBtn.disabled = true;
                submitBtn.textContent = 'Enviando...';

                var formData = new FormData(form);
                log('Enviando formulario a FormSubmit...');

                enviarConTimeout(form.action, {
                    method: 'POST',
                    body: formData,
                    headers: { 'Accept': 'application/json' },
                }, 12000)
                .then(function (res) {
                    if (res.ok) {
                        log('Formulario enviado OK');
                        form.reset();
                        abrirModal();
                    } else {
                        // El servidor rechazó: envío tradicional como fallback
                        log('Error del servidor, fallback a envío tradicional');
                        console.warn('[SESA] Respuesta no OK en AJAX. Activando fallback tradicional. Estado:', res.status);
                        form.submit();
                    }
                })
                .catch(function (err) {
                    // Sin red o fetch bloqueado: envío tradicional como fallback
                    log('Sin red, fallback a envío tradicional');
                    console.error('[SESA] Error en envío AJAX. Activando fallback tradicional.', err);
                    form.submit();
                });
            });
        }

        // ── Modal: cerrar con botón o tecla Escape ───────────────────────────
        var btnCerrar = document.getElementById('modal-close');
        if (btnCerrar) {
            btnCerrar.addEventListener('click', cerrarModal);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { cerrarModal(); }
        });

        // Clic en fondo oscuro también cierra el modal
        var overlay = document.getElementById('modal-ok');
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { cerrarModal(); }
            });
        }
    });
})();
