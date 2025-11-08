#!/usr/bin/env node
/**
 * Test script para verificar que Puppeteer funciona en el entorno actual
 * 
 * Uso:
 *   node src/scripts/test-puppeteer.js
 * 
 * O desde Docker:
 *   docker-compose exec backend node dist/scripts/test-puppeteer.js
 */

const puppeteer = require('puppeteer');

async function testPuppeteer() {
  const { logger } = await import('../utils/logger.js')
  logger.info('🧪 Iniciando test de Puppeteer...\n');
  
  try {
    // Configuración (igual que en mail.service.ts)
    const launchOptions = {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ],
      headless: true
    };
    
    // Si existe PUPPETEER_EXECUTABLE_PATH, úsalo
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      logger.info({ path: process.env.PUPPETEER_EXECUTABLE_PATH }, '✅ Usando Chromium del sistema')
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      logger.warn('⚠️  No se encontró PUPPETEER_EXECUTABLE_PATH, usando Chrome de Puppeteer');
    }
    
  logger.info('📦 Lanzando navegador...');
    const browser = await puppeteer.launch(launchOptions);
    
  logger.info('✅ Navegador lanzado exitosamente!')
  logger.info({ version: await browser.version() }, 'Browser version')
    
  logger.info('\n📄 Generando PDF de prueba...');
    const page = await browser.newPage();
    
    // HTML de prueba
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .card {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            h1 {
              color: #667eea;
              margin: 0 0 20px 0;
            }
            .success {
              color: #10b981;
              font-size: 48px;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success">✅</div>
            <h1>Puppeteer Test Exitoso!</h1>
            <p>Este PDF fue generado por Puppeteer en tu entorno.</p>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO')}</p>
            <p><strong>Node Version:</strong> ${process.version}</p>
            <p><strong>Platform:</strong> ${process.platform}</p>
            <p><strong>Arch:</strong> ${process.arch}</p>
          </div>
        </body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
  logger.info('✅ PDF generado exitosamente!')
  logger.info({ sizeKb: Math.round(pdf.length / 1024) }, 'PDF size')
    
    // Guardar PDF (opcional)
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(process.cwd(), 'test-puppeteer.pdf');
    fs.writeFileSync(outputPath, pdf);
  logger.info({ outputPath }, '💾 PDF guardado en')
    
    await browser.close();
  logger.info('\n🎉 Test completado exitosamente!\n')
  logger.info('✅ Puppeteer está funcionando correctamente en este entorno.')
  logger.info('✅ Los PDFs de facturas deberían generarse sin problemas.\n')
    
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, '❌ Error en el test de Puppeteer')
    logger.error('📋 Troubleshooting: 1) Verifica que Chromium esté instalado: apk add chromium chromium-chromedriver; 2) Verifica variables de entorno: PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser; PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true; 3) Si estás en Docker, usa flags --no-sandbox --disable-setuid-sandbox; Más info: https://pptr.dev/troubleshooting')
    process.exit(1);
  }
}

testPuppeteer();
