"use client"
import Image from 'next/image'
import { useState } from "react";

export default function Home() {
  const [inputValue, setInputValue] = useState<string>('');
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);  // Clear any previous errors

      const response = await fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: inputValue }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Network response was not ok');
      }

      const data = await response.json();
      setOutput(data.decryptedString || JSON.stringify(data));
      setLoading(false);
    } catch (error: any) {
      console.error('Error:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const handleReset = () => {
    setOutput(null);
    setError(null);
    setInputValue('');
  };

  return (
    <main className="flex flex-col items-center font-jakarta h-screen">
      <p className="my-4 flex items-center text-3xl">
        Run AI jobs using
        <Image width={142} height={142} alt="Lilypad logo" src="./lilypad-logo.svg" className="ml-2" />
      </p>
      <div className="flex-grow flex flex-col items-center justify-center w-full mx-auto py-6">
        {loading ? (
          <div className="text-center flex flex-col gap-4">
            <Image
              width={48}
              height={48}
              alt="Lilypad loader"
              src="./lilypad-svg.svg"
              className="transform animate-spin mx-auto"
            />
            <p className="text-center">....generating</p>
            <sup>Job may take a few minutes to be completed. Hang tight!</sup>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              placeholder="Enter prompt"
              className="text-black p-2 rounded-sm"
              rows={10}
              cols={40}
              onChange={(e) => setInputValue(e.target.value)}
              value={inputValue}
            ></textarea>
            <div className="flex gap-2 mx-auto">
              <button className="border border-white rounded-md p-2" onClick={handleSubmit}>
                Submit
              </button>
              <button className="border border-white rounded-md p-2" onClick={handleReset}>
                Reset
              </button>
            </div>
          </div>
        )}
        {output && (
          <div className="unset min-h-[100px] mt-12 border border-white rounded-md">
            <pre className="whitespace-pre-wrap p-4 bg-gray-800 text-white rounded-md">{output}</pre>
          </div>
        )}
        {error && (
          <div className="unset min-h-[100px] mt-12 border border-red-500 rounded-md">
            <pre className="whitespace-pre-wrap p-4 bg-gray-800 text-red-500 rounded-md">{error}</pre>
          </div>
        )}
      </div>
    </main>
  );
}
