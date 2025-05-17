interface WeatherInput {
  city: string;
}

async function handler(args: WeatherInput): Promise<{
  content: { type: 'text', text: string }[]
}> {
  const { city } = args;

  // Get grid point data
  const pointsUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(city.toString())}`;
  const geocodingData = await makeNWSRequest<GeocodingResponse>(pointsUrl);

  if (!geocodingData?.[0]) {
    return {
      content: [
        {
          type: 'text',
          text: 'Failed to get forecast URL from grid point data',
        },
      ],
    };
  }

  const { geometry: { coordinates: [longitude, latitude] }, properties: { title: name } } = geocodingData[0];

  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;
  if (!forecastUrl) {
    return {
      content: [
        {
          type: 'text',
          text: 'Failed to get forecast URL from grid point data',
        },
      ],
    };
  }

  // Get forecast data
  const data = await makeNWSRequest<WeatherResponse>(forecastUrl);
  if (!data) {
    return {
      content: [
        {
          type: 'text',
          text: 'Failed to retrieve forecast data',
        },
      ],
    };
  }

  // In a real scenario, this would call a weather API
  // For now, we return this sample data
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          city: name,
          time: data.current.time,
          temperature: data.current.apparent_temperature,
          condition: getWeatherCondition(data.current.weather_code),
          humidity: data.current.relative_humidity_2m,
        }),
      },
    ],
  };
}

export default handler;

interface Geocoding {
  geometry: {
    coordinates: number[],
    type: string
  },
  type: string,
  properties: {
    addressCode: string,
    title: string,
    dataSource?: string,
  }
}

type GeocodingResponse = Geocoding[];

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return conditions[code] ?? 'Unknown';
}

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} body: ${await response.text()}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error('Error making NWS request:', error);
    return null;
  }
}

interface WeatherResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    weather_code: number;
  };
}
