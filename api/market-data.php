<?php
/*
 * Finora market-data proxy.
 *
 * The browser sends an allowed action and its normal query parameters.
 * PHP adds the secret provider key on the server and forwards the JSON.
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Only GET requests are allowed.']);
    exit;
}

$action = $_GET['action'] ?? '';

// Classroom defaults keep local setup simple. Environment variables, when
// present, override these values without requiring any code changes.
$defaultApiKeys = [
    'FINNHUB_API_KEY' => 'd8qk0r9r01qrf6e1n31gd8qk0r9r01qrf6e1n320',
    'TWELVE_DATA_API_KEY' => '76d6376ad8b54c4681c49311a31590a6',
];

// Each action has one fixed provider URL and a short list of allowed inputs.
$actions = [
    'time_series' => [
        'url' => 'https://api.twelvedata.com/time_series',
        'env' => 'TWELVE_DATA_API_KEY',
        'key_param' => 'apikey',
        'params' => ['symbol', 'interval', 'outputsize', 'exchange', 'country'],
    ],
    'symbol_search' => [
        'url' => 'https://api.twelvedata.com/symbol_search',
        'env' => 'TWELVE_DATA_API_KEY',
        'key_param' => 'apikey',
        'params' => ['symbol', 'outputsize'],
    ],
    'stocks' => [
        'url' => 'https://api.twelvedata.com/stocks',
        'env' => 'TWELVE_DATA_API_KEY',
        'key_param' => 'apikey',
        'params' => ['country', 'outputsize'],
    ],
    'market_movers' => [
        'url' => 'https://api.twelvedata.com/market_movers/stocks',
        'env' => 'TWELVE_DATA_API_KEY',
        'key_param' => 'apikey',
        'params' => ['direction', 'outputsize', 'country'],
    ],
    'quote' => [
        'url' => 'https://finnhub.io/api/v1/quote',
        'env' => 'FINNHUB_API_KEY',
        'key_param' => 'token',
        'params' => ['symbol'],
    ],
    'company_search' => [
        'url' => 'https://finnhub.io/api/v1/search',
        'env' => 'FINNHUB_API_KEY',
        'key_param' => 'token',
        'params' => ['q'],
    ],
    'company_news' => [
        'url' => 'https://finnhub.io/api/v1/company-news',
        'env' => 'FINNHUB_API_KEY',
        'key_param' => 'token',
        'params' => ['symbol', 'from', 'to'],
    ],
];

if (!is_string($action) || !isset($actions[$action])) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown market-data action.']);
    exit;
}

$config = $actions[$action];
$apiKey = getenv($config['env']) ?: ($defaultApiKeys[$config['env']] ?? '');

if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'A required market-data environment variable is missing.']);
    exit;
}

$query = [];
foreach ($config['params'] as $name) {
    if (isset($_GET[$name]) && is_string($_GET[$name])) {
        $value = trim($_GET[$name]);
        if ($value !== '' && strlen($value) <= 100) {
            $query[$name] = $value;
        }
    }
}
$query[$config['key_param']] = $apiKey;

$url = $config['url'] . '?' . http_build_query($query);
$curl = curl_init($url);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_USERAGENT => 'Finora/1.0',
]);

$body = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($curl);
curl_close($curl);

if ($body === false) {
    http_response_code(502);
    echo json_encode(['error' => 'The market-data provider could not be reached.']);
    error_log('Finora market proxy: ' . $curlError);
    exit;
}

http_response_code($status >= 100 ? $status : 200);
echo $body;
