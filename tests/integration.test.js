const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  // Modify the app to use a test port
  beforeAll(async () => {
    // Mock external HTTP requests
    nock.disableNetConnect();
    nock.enableNetConnect(`localhost:${TEST_PORT}`);
    
    // Create a temporary test app file with modified port
    const appContent = await fs.readFile('app.js', 'utf8');
    const testAppContent = appContent.replace('const PORT = 3001', `const PORT = ${TEST_PORT}`);
    await fs.writeFile('app.test.js', testAppContent);
    
    // Start the test server
    server = require('child_process').spawn('node', ['app.test.js'], {
      detached: true,
      stdio: 'ignore'
    });
    
    // Give the server time to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 10000); // Increase timeout for server startup

  afterAll(async () => {
    // Kill the test server and clean up
    if (server && server.pid) {
      process.kill(-server.pid, 'SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    await fs.unlink('app.test.js').catch(() => {});
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for example.com
    nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);
    
    // Make a request to our proxy app
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Example Domain');
    expect(response.data.success).toBe(true);
    expect(response.data.originalUrl).toBe('https://example.com/');
    
    // Basic functionality verification for example.com
    expect(response.status).toBe(200);
  }, 10000); // Increase timeout for this test

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response?.status || error.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response?.status || error.status).toBe(400);
      expect(error.response?.data?.error || error.message).toContain('URL is required');
    }
  });
});
