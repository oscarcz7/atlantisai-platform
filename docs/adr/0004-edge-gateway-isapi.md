# ADR-0004: Edge Gateway con ISAPI para los lectores

- Estado: Propuesta (se acepta tras la PoC)
- Fecha: 2026-11-18

## Contexto
Los lectores exponen ISAPI en la red local. Desde la nube solo se alcanzan con algo dentro del edificio o mediante ISUP, que requiere el SDK de Hikvision y un servidor con puertos expuestos.

## Decisión
Un mini PC (gateway) en la red del edificio mantiene un túnel saliente hacia la nube y habla ISAPI con los lectores. La lógica de dispositivo está detrás de la interfaz `AccessControlDevice`.

## Consecuencias
- Sin IP pública ni puertos abiertos; depuración local sencilla; cola offline.
- Un equipo más que instalar, alimentar con UPS y mantener.
- Si la PoC muestra limitaciones, la interfaz permite cambiar a ISUP sin tocar el resto del sistema.
