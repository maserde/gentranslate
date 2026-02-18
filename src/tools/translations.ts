import { OpenRouter } from '@openrouter/sdk'
import * as fs from 'node:fs'

class TranslationFlat {
	constructor(
		public readonly key: string = '',
		public readonly value: string = ''
	) {}
}

class Language {
	public readonly code: string = 'en'
	public readonly name: string = 'English'
	private entries: Record<string, string> = {
		af: 'Afrikaans',
		ak: 'Akan',
		sq: 'Albanian',
		am: 'Amharic',
		ar: 'Arabic',
		hy: 'Armenian',
		as: 'Assamese',
		ay: 'Aymara',
		az: 'Azerbaijani',
		bm: 'Bambara',
		eu: 'Basque',
		be: 'Belarusian',
		bn: 'Bengali',
		bho: 'Bhojpuri',
		bs: 'Bosnian',
		bg: 'Bulgarian',
		ca: 'Catalan',
		ceb: 'Cebuano',
		ny: 'Chichewa',
		zh: 'Chinese (Simplified)',
		'zh-TW': 'Chinese (Traditional)',
		'zh-CN': 'Chinese (Simplified)',
		co: 'Corsican',
		hr: 'Croatian',
		cs: 'Czech',
		da: 'Danish',
		dv: 'Divehi',
		doi: 'Dogri',
		nl: 'Dutch',
		en: 'English',
		eo: 'Esperanto',
		et: 'Estonian',
		ee: 'Ewe',
		tl: 'Filipino',
		fi: 'Finnish',
		fr: 'French',
		fy: 'Frisian',
		gl: 'Galician',
		lg: 'Ganda',
		ka: 'Georgian',
		de: 'German',
		gom: 'Goan Konkani',
		el: 'Greek',
		gn: 'Guarani',
		gu: 'Gujarati',
		ht: 'Haitian Creole',
		ha: 'Hausa',
		haw: 'Hawaiian',
		he: 'Hebrew',
		iw: 'Hebrew',
		hi: 'Hindi',
		hmn: 'Hmong',
		hu: 'Hungarian',
		is: 'Icelandic',
		ig: 'Igbo',
		ilo: 'Iloko',
		id: 'Indonesian',
		ga: 'Irish',
		it: 'Italian',
		ja: 'Japanese',
		jw: 'Javanese',
		jv: 'Javanese',
		kn: 'Kannada',
		kk: 'Kazakh',
		km: 'Khmer',
		rw: 'Kinyarwanda',
		ko: 'Korean',
		kri: 'Krio',
		ku: 'Kurdish (Kurmanji)',
		ckb: 'Kurdish (Sorani)',
		ky: 'Kyrgyz',
		lo: 'Lao',
		la: 'Latin',
		lv: 'Latvian',
		ln: 'Lingala',
		lt: 'Lithuanian',
		lb: 'Luxembourgish',
		mk: 'Macedonian',
		mai: 'Maithili',
		mg: 'Malagasy',
		ms: 'Malay',
		ml: 'Malayalam',
		mt: 'Maltese',
		'mni-Mte': 'Manipuri (Meitei Mayek)',
		mi: 'Maori',
		mr: 'Marathi',
		lus: 'Mizo',
		mn: 'Mongolian',
		my: 'Myanmar (Burmese)',
		ne: 'Nepali',
		nso: 'Northern Sotho',
		no: 'Norwegian',
		or: 'Odia (Oriya)',
		om: 'Oromo',
		ps: 'Pashto',
		fa: 'Persian',
		pl: 'Polish',
		pt: 'Portuguese',
		pa: 'Punjabi',
		qu: 'Quechua',
		ro: 'Romanian',
		ru: 'Russian',
		sm: 'Samoan',
		sa: 'Sanskrit',
		gd: 'Scots Gaelic',
		sr: 'Serbian',
		st: 'Sesotho',
		sn: 'Shona',
		sd: 'Sindhi',
		si: 'Sinhala',
		sk: 'Slovak',
		sl: 'Slovenian',
		so: 'Somali',
		es: 'Spanish',
		su: 'Sundanese',
		sw: 'Swahili',
		sv: 'Swedish',
		tg: 'Tajik',
		ta: 'Tamil',
		tt: 'Tatar',
		te: 'Telugu',
		th: 'Thai',
		ti: 'Tigrinya',
		ts: 'Tsonga',
		tr: 'Turkish',
		tk: 'Turkmen',
		uk: 'Ukrainian',
		ur: 'Urdu',
		ug: 'Uyghur',
		uz: 'Uzbek',
		vi: 'Vietnamese',
		cy: 'Welsh',
		xh: 'Xhosa',
		yi: 'Yiddish',
		yo: 'Yoruba',
		zu: 'Zulu'
	}

	constructor(input: string) {
		const languageCode = this.getLanguageNameByCode(input)
		const languageName = this.getLanguageCodeByName(input)
		if (!languageCode && !languageName)
			throw new Error(`Invalid language: ${input}`)
		this.name = languageCode as string
		this.code = languageCode as string
	}

	public getLanguageNameByCode(code: string): string | undefined {
		return this.entries.hasOwnProperty(code) ? this.entries[code] : undefined
	}

	public getLanguageCodeByName(name: string): string | undefined {
		return Object.entries(this.entries).find(
			([_, value]) => value === name
		)?.[0]
	}

	public getAllLanguageCodes(): string[] {
		return Object.keys(this.entries)
	}
}

class SafeAsync<T> {
	public errors: Error[] = []

	constructor(
		private readonly fn: () => Promise<T>,
		private readonly retries = 3
	) {}

	async run(): Promise<T | null> {
		for (let i = 0; i < this.retries; i++) {
			try {
				return await this.fn()
			} catch (error) {
				this.errors.push(error as Error)
				if (i === this.retries - 1) return null
				console.error(`Retry ${i + 1} for ${this.fn.name} failed: ${error}`)
				await new Promise((resolve) =>
					setTimeout(resolve, Math.pow(2, i) * 1000)
				)
			}
		}
		return null
	}
}

class LLMTranslation {
	private readonly LLM_SYSTEM_PROMPT = `You are a professional translator for a Trade-in POS (Point of Sale) SaaS application. Translate the following UI text strings from English to {:language}.

Domain context:
- This is a buyback/trade-in platform where customers sell used items (phones, electronics, etc.)
- Offer types describe HOW items are traded in (in-store, by mail, etc.)
- Use standard/formal register appropriate for business software

Translation rules:
1. PRESERVE placeholders exactly as-is: {value}, {type}, {0}, {1}, etc. — do not translate content inside curly braces
2. TRANSLATE all descriptive English terms including offer types, conditions, and UI labels
3. Only keep in English: proper brand names (Apple, Samsung), model numbers (iPhone 15), and code identifiers
4. Output ONLY a valid JSON object — no markdown, no explanation, no extra text

Domain glossary (MUST be translated, not kept in English):
- "In-Store" → physical store location (e.g., Indonesian: "di toko")
- "Mail-in" → send by postal mail (e.g., Indonesian: "kirim pos")  
- "Bulk Quote" → wholesale/volume pricing (e.g., Indonesian: "penawaran grosir")
- "Easy Offer" → simple/quick offer (e.g., Indonesian: "penawaran mudah")
- "Trade-in" → exchange old item for value (translate to local equivalent)
- "Offer" → proposal/bid (translate appropriately)

Example of CORRECT vs INCORRECT translation (e.g. Indonesian):
- WRONG: "In-Store Offer" → "Penawaran In-Store" (kept English term)
- RIGHT: "In-Store Offer" → "Penawaran di Toko" (fully translated)

Input format: JSON object where keys are numeric indices and values are strings to translate.
Output format: JSON object with the same numeric keys and fully translated strings as values.
Input:\n`
	private readonly LLM_INPUT_PROMPT = `{:input}`

	private llmClient: OpenRouter

	constructor(public readonly language: Language) {
		this.llmClient = new OpenRouter({
			apiKey: process.env.OPENROUTER_API_KEY
		})
	}

	private async sendLLMRequest(
		systemPrompt: string,
		userPrompt: string
	): Promise<Record<string, string>> {
		const response = await this.llmClient.chat.send({
			chatGenerationParams: {
				model: 'google/gemini-2.0-flash-001',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				temperature: 0.2,
				stream: false,
				responseFormat: {
					type: 'json_schema',
					jsonSchema: {
						name: 'translation_output',
						schema: {
							type: 'object',
							additionalProperties: { type: 'string' }
						}
					}
				}
			}
		})

		const content = response.choices[0]?.message?.content
		if (typeof content !== 'string') {
			throw new Error('Unexpected response format from LLM')
		}
		return JSON.parse(content)
	}

	private generateTranslationFormattedInput(
		translations: TranslationFlat[]
	): string {
		return translations
			.map(
				(translation, index) =>
					`[${index}]["${translation.key}"] "${translation.value}"`
			)
			.join('\n')
	}

	private generateSystemPrompt(languageName: string): string {
		return this.LLM_SYSTEM_PROMPT.replace('{:language}', languageName)
	}

	private generateUserPrompt(input: string): string {
		return this.LLM_INPUT_PROMPT.replace('{:input}', input)
	}

	public async translate(translations: TranslationFlat[]): Promise<{
		success: boolean
		data: TranslationFlat[] | null
	}> {
		const formattedInput = this.generateTranslationFormattedInput(translations)
		const systemPrompt = this.generateSystemPrompt(this.language.name)
		const userPrompt = this.generateUserPrompt(formattedInput)
		const task = new SafeAsync(() =>
			this.sendLLMRequest(systemPrompt, userPrompt)
		)
		const result = await task.run()
		if (!result) {
			console.error(
				JSON.stringify({
					message: 'LLM request failed',
					metadata: {
						systemPrompt,
						userPrompt,
						errors: task.errors.map((e) => e.message)
					}
				})
			)
			return {
				success: false,
				data: null
			}
		}

		return {
			success: true,
			data: translations.map(
				(translation, index) =>
					new TranslationFlat(
						translation.key,
						result[String(index)] ?? translation.value
					)
			)
		}
	}
}

class TranslationJsonFile {
	public readonly value: Record<string, string | object>
	public readonly name: string

	constructor(public readonly path: string) {
		this.value = JSON.parse(fs.readFileSync(path, 'utf-8'))
		this.name = path.split('/').pop()?.replace('.json', '') ?? ''
	}

	public getValue(key: string): string | object | undefined {
		const keys: string[] = key.split('.')
		return this.resolve(this.value, keys)
	}

	public setValue(key: string, value: string | object): void {
		const keys: string[] = key.split('.')
		this.set(this.value, keys, value)
	}

	public write() {
		fs.writeFileSync(this.path, JSON.stringify(this.value, null, 2))
	}

	public flatten(): Record<string, string> {
		const result: Record<string, string> = {}
		this.flattenObject(this.value, [], result)
		return result
	}

	private flattenObject(
		obj: Record<string, string | object>,
		keys: string[],
		result: Record<string, string>
	): void {
		for (const [key, value] of Object.entries(obj)) {
			const newKeys = [...keys, key]
			if (typeof value === 'object' && !Array.isArray(value)) {
				this.flattenObject(
					value as Record<string, string | object>,
					newKeys,
					result
				)
			} else if (typeof value === 'string') {
				result[newKeys.join('.')] = value
			}
		}
	}

	private resolve(
		obj: Record<string, string | object>,
		keys: string[]
	): string | object | undefined {
		if (keys.length === 0) return undefined
		if (keys.length === 1) return obj[keys[0]]
		const [firstKey, ...restKeys] = keys
		if (!(firstKey in obj) || typeof obj[firstKey] !== 'object')
			return undefined
		return this.resolve(
			obj[firstKey] as Record<string, string | object>,
			restKeys
		)
	}

	private set(
		obj: Record<string, string | object>,
		keys: string[],
		value: string | object
	): void {
		if (keys.length === 0) return
		if (keys.length === 1) obj[keys[0]] = value
		else {
			const [firstKey, ...restKeys] = keys
			if (!(firstKey in obj) || typeof obj[firstKey] !== 'object')
				obj[firstKey] = {}
			this.set(
				obj[firstKey] as Record<string, string | object>,
				restKeys,
				value
			)
		}
	}

	public diff(other: TranslationJsonFile): TranslationFlat[] {
		const entries = this.flatten()
		const otherEntries = other.flatten()
		const result: TranslationFlat[] = []
		for (const [key, value] of Object.entries(entries)) {
			if (value !== otherEntries[key])
				result.push(new TranslationFlat(key, value))
		}
		for (const [key, value] of Object.entries(otherEntries)) {
			if (!(key in entries)) result.push(new TranslationFlat(key, value))
		}
		return result
	}
}

const getAllTranslationJsonFiles = (path: string): TranslationJsonFile[] => {
	const files = fs.readdirSync(path)
	return files
		.filter((f) => f.endsWith('.json'))
		.map((f) => new TranslationJsonFile(path + '/' + f))
}

interface IBatchOptions {
	batchSize: number
}

class Batch<T> {
	public batch: T[][] = []

	constructor(public readonly items: T[]) {}

	create(options: IBatchOptions = { batchSize: 50 }) {
		for (let i = 0; i < this.items.length; i += options.batchSize) {
			this.batch.push(this.items.slice(i, i + options.batchSize))
		}
		return this.batch
	}
}

const translateFile = async (
	file: TranslationJsonFile,
	changeBatches: TranslationFlat[][]
): Promise<void> => {
	const languageCode = file.name.replace('.json', '')
	const llm = new LLMTranslation(new Language(languageCode))

	const pending = changeBatches.map((batch) => llm.translate(batch))
	const results = await Promise.all(pending)

	for (const result of results) {
		if (!result.success) {
			console.error(`LLM translation failed for ${file.name}`)
			continue
		}

		for (const translation of result.data ?? []) {
			file.setValue(translation.key, translation.value)
		}
	}

	file.write()
}

const translateAll = async (
	files: TranslationJsonFile[],
	changes: TranslationFlat[]
): Promise<void> => {
	const changeBatches = new Batch(changes).create({ batchSize: 50 })
	const fileBatches = new Batch(files).create({ batchSize: 10 })

	const total = files.length
	let done = 0

	console.log(
		`Translating ${changes.length} changes across ${total} files (${fileBatches.length} batches)`
	)

	for (const [i, fileBatch] of fileBatches.entries()) {
		console.log(
			`Batch ${i + 1}/${fileBatches.length} - processing ${fileBatch.length} files...`
		)

		await Promise.all(
			fileBatch.map((file) =>
				translateFile(file, changeBatches).then(() => {
					done++
					console.log(`  [${done}/${total}] ${file.name} done`)
				})
			)
		)
	}

	console.log(`Done. ${total} files translated.`)
}

export const patchTranslations = async (
	baseTranslationFilePath: string,
	patchedTranslationFilePath: string,
	translationFolderPath: string
) => {
	const originalTranslation = new TranslationJsonFile(baseTranslationFilePath)
	const patchedTranslation = new TranslationJsonFile(patchedTranslationFilePath)
	const translationChanges = originalTranslation.diff(patchedTranslation)
	const targetFiles = getAllTranslationJsonFiles(translationFolderPath)
	await translateAll(targetFiles, translationChanges)
}
