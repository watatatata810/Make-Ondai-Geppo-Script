import { GoogleGenAI } from '@google/genai';

/**
 * Gemini APIを呼び出して月報を生成します。
 * 
 * @param {string} apiKey GeminiのAPIキー
 * @param {string} promptTemplate Prompt.mdのテキスト内容
 * @param {string} excelData extractExcelDataで抽出したCSV風テキスト
 * @param {string} campusName キャンパス名（例: "池袋キャンパス"）
 * @param {string} modelName 使用するモデル名（省略時はgemini-3.5-flash）
 * @returns {Promise<string|null>} 生成されたMarkdownテキスト、エラー時はnull
 */
/**
 * Gemini APIのエラーを解析し、ユーザーフレンドリーな日本語メッセージに変換します。
 * 元のエラーメッセージもデバッグ用に末尾に付加します。
 */
function handleGeminiError(error, context = 'API呼び出し', signal) {
  // タイムアウト/ユーザーキャンセルによる中断は、AbortSignalの状態から確実に判定する
  // （SDKが投げるエラーの文言に依存すると、SDKのバージョン変化で誤判定しうるため）。
  if (signal && signal.aborted) {
    if (signal.reason === 'timeout') {
      return new Error(`AIによる${context}がタイムアウトしました（10分経過しても応答がありませんでした）。しばらく時間を置いてから再度実行するか、画面右上から別のモデルを選択してお試しください。`);
    }
    return new Error(`${context}をキャンセルしました。`);
  }

  const msg = error.message || String(error);
  let friendlyMessage = `AIによる${context}中に予期せぬエラーが発生しました。`;

  if (msg.includes('API_KEY_INVALID') || msg.toLowerCase().includes('api key not valid') || (msg.includes('400') && msg.toLowerCase().includes('key'))) {
    friendlyMessage = 'APIキーが無効、または正しく設定されていません。画面右上の設定から有効なキーが設定されているか確認してください。';
  } else if (msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota exceeded') || msg.includes('429')) {
    friendlyMessage = 'APIの利用制限（クォータ）に達しました。別のモデルを選択して再度お試しください。';
  } else if (msg.includes('SAFETY') || msg.toLowerCase().includes('blocked') || msg.toLowerCase().includes('candidate')) {
    friendlyMessage = '安全性の判定（セーフティフィルター）により、コンテンツの生成が制限されました。Excel内のテキストやプロンプトの内容を見直してください。';
  } else if (msg.includes('503') || msg.toLowerCase().includes('service unavailable') || msg.toLowerCase().includes('overloaded') || error.status === 503) {
    friendlyMessage = 'Gemini APIサーバーが一時的に混雑しています（503 Service Unavailable）。しばらく時間を置いてから再度実行するか、画面右上から別のモデルを選択してお試しください。';
  } else if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.toLowerCase().includes('connect')) {
    friendlyMessage = 'インターネット接続に失敗しました。ネットワーク環境やプロキシ、オフライン状態でないかをご確認ください。';
  } else if (msg.includes('not found') || msg.includes('404') || msg.toLowerCase().includes('model')) {
    friendlyMessage = '指定されたAIモデルが見つからないか、お使いのAPIキーでは利用できません。画面右上から別のモデルを選択してお試しください。';
  }

  return new Error(`${friendlyMessage}\n(詳細: ${msg})`);
}

/**
 * @param {AbortSignal} [signal] 呼び出し元(main.js)が生成したAbortControllerのsignal。
 *   タイムアウト（10分）とユーザーによるキャンセルの両方が、このsignalのabortを通じて伝搬される。
 */
export async function generateReport(apiKey, promptTemplate, excelData, campusName, modelName = 'gemini-3.5-flash', signal) {
  if (!apiKey) {
    throw new Error('API key is required.');
  }

  // Initialize the official SDK
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // 実行当日の日付を取得してプロンプトにコンテキストとして付与する
  const today = new Date();
  const formattedDate = `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`;
  const systemContext = `【重要: システム情報】\nプログラムが実行されている当日の日付は「${formattedDate}」です。プロンプト内の「実行当日の年月日」にはこの日付を使用してください。\n\n`;

  const fullPrompt = `${systemContext}${promptTemplate}\n\n### DATA FROM EXCEL (${campusName})\n${excelData}`;

  console.log(`Calling Gemini API (${modelName}) for ${campusName}...`);

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      // @google/genai v2.8のGenerateContentConfigはabortSignalを公式サポートしており
      // (dist/genai.d.ts の GenerateContentConfig.abortSignal)、内部実装でも
      // config.abortSignal がそのままHTTPリクエストのAbortControllerへ渡されることを確認済み。
      config: signal ? { abortSignal: signal } : undefined,
    });

    return response.text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw handleGeminiError(error, '月報の生成', signal);
  }
}

/**
 * 利用可能なGeminiモデルの一覧を取得し、最新のFlashモデルを決定します。
 * 
 * @param {string} apiKey GeminiのAPIキー
 * @returns {Promise<{allModels: string[], defaultModel: string}>} モデル情報のオブジェクト
 */
export async function getAvailableModels(apiKey) {
  if (!apiKey) {
    throw new Error('API key is required.');
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const modelNames = [];

  try {
    const response = await ai.models.list();

    // SDK of Pager
    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      for await (const model of response) {
        if (model.name) modelNames.push(model.name);
      }
    } else if (Array.isArray(response)) {
      response.forEach(m => { if (m.name) modelNames.push(m.name); });
    } else if (response.models && Array.isArray(response.models)) {
      response.models.forEach(m => { if (m.name) modelNames.push(m.name); });
    }

    // 'gemini' を含むモデルのみを抽出し、目的外のモデルを除外
    const excludeKeywords = ['-image', '-tts', 'robotics', 'computer-use', 'embedding'];
    const geminiModels = modelNames
      .filter(m => typeof m === 'string' && m.includes('gemini'))
      .map(m => m.replace('models/', '')) // 'models/' プレフィックスを削除
      .filter(name => !excludeKeywords.some(keyword => name.includes(keyword)));

    // 'flash' を含むモデルを抽出
    const flashModels = geminiModels.filter(m => m.includes('flash'));

    // バージョン番号で降順ソート
    flashModels.sort((a, b) => {
      const getVersion = (name) => {
        const match = name.match(/(\d+\.\d+)/);
        return match ? parseFloat(match[1]) : 0;
      };
      return getVersion(b) - getVersion(a);
    });

    // デフォルトモデルの決定: gemini-3.5-flashがあればそれを最優先、
    // 無ければ従来どおり最新バージョンのflash系モデルにフォールバックする。
    const hasGemini35Flash = geminiModels.includes('gemini-3.5-flash');
    const defaultModel = hasGemini35Flash
      ? 'gemini-3.5-flash'
      : (flashModels.length > 0 ? flashModels[0] : (geminiModels.length > 0 ? geminiModels[0] : 'gemini-3.5-flash'));

    return {
      allModels: geminiModels,
      defaultModel: defaultModel
    };
  } catch (error) {
    console.error('Error fetching models:', error);
    throw handleGeminiError(error, '利用可能なモデルの取得');
  }
}
