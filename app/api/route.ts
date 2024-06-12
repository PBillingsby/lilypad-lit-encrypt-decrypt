import { NextRequest, NextResponse } from 'next/server';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  connectToLitNode,
  encryptData,
  decryptData,
} from '../utils/lit'; // Adjust the import path accordingly

async function fetchWithRetry(url: string, options: AxiosRequestConfig, retries = 5, delay = 1000): Promise<AxiosResponse> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempt ${i + 1} to fetch from ${url}`);
      const response = await axios(url, options);
      console.log(`Successful response on attempt ${i + 1}`);
      return response;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        console.error('Max retries reached');
        throw error;
      }
    }
  }
  throw new Error('Max retries reached');
}

export async function POST(req: NextRequest) {
  try {
    console.log('Received POST request');
    const { inputs } = await req.json();
    console.log('Parsed request body:', { inputs });

    const pk = process.env.PK;
    if (!pk) {
      throw new Error('PK environment variable is not set');
    }
    const module = 'cowsay:v0.0.3';
    const body = {
      pk: pk,
      module: module,
      inputs: `-i Message='${inputs}'`,
      opts: { stream: true },
    };

    console.log('Constructed request body:', body);

    const requestOptions: AxiosRequestConfig = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      data: body,
    };

    console.log('Request options:', requestOptions);

    const response = await fetchWithRetry('http://js-cli-wrapper.lilypad.tech', requestOptions);
    const data = response.data;

    console.log('Fetched data:', data);

    // Encrypt the response data using Lit Protocol
    const client = await connectToLitNode();
    console.log('Connected to LIT node');
    const encryptedData = await encryptData({ client, message: JSON.stringify(data) });
    console.log('Encrypted data:', encryptedData);

    // Decrypt the response data using Lit Protocol (for demonstration)
    try {
      const decryptedData = await decryptData({ client, ciphertext: encryptedData.ciphertext, dataToEncryptHash: encryptedData.dataToEncryptHash });
      console.log('Decrypted data:', decryptedData);
      await client.disconnect();
      // Ensure the string is properly parsed and formatted
      const formattedString = JSON.parse(decryptedData.decryptedString);
      return NextResponse.json({ decryptedString: formattedString });
    } catch (decryptError: any) {
      console.error('Decryption failed:', decryptError.message);
      await client.disconnect();
      return NextResponse.json({ error: decryptError.message }, { status: 403 });
    }

  } catch (error) {
    console.error('Error during POST request:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
