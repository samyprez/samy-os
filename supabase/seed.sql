-- Replace the placeholder user id after creating the first Supabase user.
-- These inserts are intentionally commented until authentication is connected.

-- insert into public.clients (user_id, name, brand, primary_contact, secondary_contact, whatsapp_name, service, status, priority, next_step, notes)
-- values
-- ('00000000-0000-0000-0000-000000000000', 'Salami Sibao', 'Amazing Solutions', 'Orian', 'Representante Toronto por confirmar', 'Pendiente', 'Website + publicidad mensual', 'Activo', 'Alta', 'Terminar actualización web y dar seguimiento a la representante de Toronto.', 'Terminar actualización web y dar seguimiento a la representante de Toronto.'),
-- ('00000000-0000-0000-0000-000000000000', 'MiKiosko.ca', 'Amazing Solutions / TorontoDominicano', 'Contacto por confirmar', 'Pendiente', 'Pendiente', 'Contenido + publicidad mensual', 'Activo', 'Alta', 'Crear contenido con productos reales y colocar banners en TorontoDominicano.', 'Crear contenido con productos reales y colocar banners en TorontoDominicano.');

-- insert into public.tasks (user_id, area, title, priority, status, source, responsible, next_action)
-- values
-- ('00000000-0000-0000-0000-000000000000', 'Salami Sibao', 'Terminar actualización web', 'Alta', 'Pendiente', 'Manual', 'Samy', 'Terminar actualización web'),
-- ('00000000-0000-0000-0000-000000000000', 'Salami Sibao', 'Dar seguimiento a representante de Toronto', 'Alta', 'Pendiente', 'Manual', 'Samy', 'Contactar representante'),
-- ('00000000-0000-0000-0000-000000000000', 'MiKiosko.ca', 'Crear contenido con productos reales', 'Alta', 'En progreso', 'Manual', 'Samy', 'Preparar contenido'),
-- ('00000000-0000-0000-0000-000000000000', 'MiKiosko.ca', 'Colocar banners en TorontoDominicano', 'Media', 'Pendiente', 'Manual', 'Samy', 'Publicar banners');
