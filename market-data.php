<?php
// File: /api/market-data.php
// A secure proxy for fetching market data for a specific stock symbol.

require __DIR__ . '/../vendor/autoload.php';

// Use Dotenv to manage API keys securely from the .env file
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

// --- Configuration ---
$apiKey = $_ENV['TWELVE_DATA_API_KEY'] ?? null;
$apiBaseUrl = 'https://api.twelvedata.com/time_series';

// --- Input Validation & Security ---
if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'Server configuration error: API key not found.']);
    exit;
}

$symbol = filter_input(INPUT_GET, 'symbol', FILTER_SANITIZE_STRING);
if (!$symbol) {
    http_response_code(400);
    echo json_encode(['error' => 'Bad Request: "symbol" parameter is required.']);
    exit;
}

// --- API Proxy Logic ---
$client = new GuzzleHttp\Client();

try {
    $response = $client->request('GET', $apiBaseUrl, [
        'query' => [
            'symbol' => $symbol,
            'interval' => '1day',
            'outputsize' => 90, // Example: fetch 90 days of data
            'apikey' => $apiKey,
        ]
    ]);

    // Set the correct content type and pass through the response from the external API
    header('Content-Type: application/json');
    echo $response->getBody();

} catch (GuzzleHttp\Exception\ClientException $e) {
    // Forward client errors (e.g., 404 Not Found if symbol is invalid)
    http_response_code($e->getResponse()->getStatusCode());
    echo $e->getResponse()->getBody()->getContents();
} catch (GuzzleHttp\Exception\GuzzleException $e) {
    // Handle other Guzzle/network errors
    http_response_code(502); // Bad Gateway
    echo json_encode(['error' => 'Failed to communicate with the market data provider.', 'details' => $e->getMessage()]);
}