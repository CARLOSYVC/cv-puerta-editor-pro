# Prisma 3D Industrial — tema para el editor HTML V13.2CV

Capa de presentación para `cv_puerta_editor_pro_V13.2CV_reorganizado.html`: superficies neutras en modo claro y oscuro, acciones cobalto, botones elevados, dock flotante compacto y menú de herramientas en mosaico.

## Paleta

| Elemento | Oscuro | Claro |
| --- | --- | --- |
| Fondo | `#0F172A` | `#F8FAFC` |
| Tarjeta | `#1E293B` | `#FFFFFF` |
| Texto | `#F8FAFC` | `#0F172A` |
| Borde | `#334155` | `#E2E8F0` |
| Acción principal | `#2563EB` | `#2563EB` |

“Digitalizar Foto” usa `#F97316` con texto `#0F172A`. Las cinco familias usan bordes e iconos en `#0284C7`, `#0D9488`, `#D97706`, `#7C3AED` y `#059669`. Clientes, Registros y Hojas de corte comparten fondo neutro y diferencian únicamente la cifra. Los números emplean variantes claras sobre fondo oscuro para conservar el contraste.

El relieve 3D se produce con sombras y respuesta a la pulsación. No hay degradados en esta capa. Las tarjetas conservan fondos neutros; las áreas de dibujo no reciben cambios de geometría SVG. En teléfono, el dock admite desplazamiento horizontal y el menú pasa a una columna en pantallas pequeñas.

Este HTML autónomo es distinto de la aplicación React/ERP del repositorio. Por eso el tema se guarda en `themes/prisma-3d/` y no se importa automáticamente en `frontend/`. Se conserva el comportamiento de la versión HTML suministrada.

## Generar el archivo completo

Requiere Node.js. No usa dependencias ni acceso a red. Desde esta carpeta:

```powershell
node build-prisma.cjs "C:/ruta/cv_puerta_editor_pro_V13.2CV_reorganizado.html" "C:/ruta/cv_puerta_editor_PRISMA_3D.html"
```

Después abre el HTML generado con Edge o Chrome. El original se obtiene del usuario y no está incluido en esta rama. El generador rechaza sobrescribirlo y verifica su SHA-256:

`0e6f8da18f86c317287fad44b28bc5498c278f4f3f86d683ab02c8aa6040c47f`

## Alcance

- Solo se añade el bloque de estilos `cv-prisma-3d`, bajo `@media screen`.
- Los 15 scripts originales permanecen idénticos y en el mismo orden.
- No se editan fórmulas, medidas, manejadores, almacenamiento, marcado ni reglas de impresión.
- Reutiliza los controles e iconos originales; conserva sus licencias.
- Respeta el tema de alto contraste y la preferencia de movimiento reducido.
- El dock conserva sus acciones y su opción de minimizar; el menú conserva los siete accesos.

## Verificación

`build-prisma.cjs` verifica recuperación exacta del original, identidad y sintaxis de scripts, seis casos de las funciones originales de pulgadas/fracciones y 12 pares de colores de texto/fondo con contraste mínimo 4,5:1. Emite un informe junto al HTML. El contraste se calcula sobre los colores definidos; no constituye una auditoría del renderizado completo.

El informe adjunto corresponde al resultado generado en esta revisión. No constituye una validación exhaustiva de cada cálculo. La vista previa local no fue accesible por problemas de conexión; quedan pendientes la revisión visual, móvil y de impresión y los recorridos interactivos. No se agregan dependencias de ejecución ni modificaciones al ERP.
