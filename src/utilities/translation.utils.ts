import axios from 'axios'
import * as fs from 'node:fs'
import { LANGUAGE_ENTRIES } from '@/constants/language.constants'
import { Logger } from '@/utilities/logger.utils'

import { OpenRouter } from '@openrouter/sdk'

export class TranslationKeyValue {
	constructor(
		public readonly key: string,
		public value: string
	) {}
}

export class TranslationFile {
	constructor(
		public readonly path: string,
		public readonly name: string = ''
	) {}
}

export class TranslationUrl {
	constructor(public readonly url: string) {}
}

export class LLMTranslation {
	private readonly LLM_SYSTEM_PROMPT = `You are a professional translator for a Trade-in POS (Point of Sale) SaaS application. Translate the following UI text strings from English to {:language}.

Domain context:
- This is a buyback/trade-in platform where customers sell used items (phones, electronics, etc.)
- Offer types describe HOW items are traded in (in-store, by mail, etc.)
- Use standard/formal register appropriate for business software

Translation rules:
1. PRESERVE placeholders exactly as-is: {value}, {type}, {0}, {1}, etc. — do not translate content inside curly braces
2. TRANSLATE all descriptive English terms including offer types, conditions, and UI labels
3. Only keep in English: proper brand names (Apple, Samsung), integration brand names (BackMarket, ShareASale, Tremendous, DataFeed), model numbers (iPhone 15), and code identifiers
4. Output ONLY a valid JSON object — no markdown, no explanation, no extra text

Domain glossary (MUST be translated, not kept in English):
- "In-Store" → physical store location (e.g., Indonesian: "di toko")
- "Mail-in" → send by postal mail (e.g., Indonesian: "kirim pos")  
- "Bulk Quote" → wholesale/volume pricing (e.g., Indonesian: "penawaran grosir")
- "Easy Offer" → simple/quick offer (e.g., Indonesian: "penawaran mudah")
- "Trade-in" → exchange old item for value (translate to local equivalent)
- "Offer" → proposal/bid (translate appropriately)
- "Markup"/"Mark Up" → increase in price (e.g., Indonesian: "Naikan Harga")
- "Mark Down"/"Mark Down" → decrease in price (e.g., Indonesian: "Turunkan Harga")

Example of CORRECT vs INCORRECT translation (e.g. Indonesian):
- WRONG: "In-Store Offer" → "Penawaran In-Store" (kept English term)
- RIGHT: "In-Store Offer" → "Penawaran di Toko" (fully translated)

Input format: JSON object where keys are numeric indices and values are strings to translate.
Output format: JSON object with the same numeric keys and fully translated strings as values.
Input:\n`
	private readonly LLM_INPUT_PROMPT = `{:input}`
	private llmClient: OpenRouter
	private logger: Logger = new Logger()

	constructor(public readonly language: { code: string; name: string }) {
		this.llmClient = new OpenRouter({
			apiKey: process.env.OPENROUTER_API_KEY
		})
		return this
	}

	private async sendLLMRequest(
		systemPrompt: string,
		userPrompt: string,
		keys: string[]
	): Promise<Record<string, string>> {
		const properties = Object.fromEntries(
			keys.map((k) => [k, { type: 'string' }])
		)
		const response = await this.llmClient.chat.send({
			chatGenerationParams: {
				model: 'google/gemini-2.0-flash-001',
				messages: [{ role: 'user', content: `${systemPrompt}\n${userPrompt}` }],
				stream: false,
				responseFormat: {
					type: 'json_schema',
					jsonSchema: {
						name: 'translations',
						strict: true,
						schema: {
							type: 'object',
							properties,
							required: keys,
							additionalProperties: false
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
		translations: TranslationKeyValue[]
	): string {
		return translations
			.map((translation, index) => `[${index}] "${translation.value}"`)
			.join('\n')
	}

	private generateSystemPrompt(languageName: string): string {
		const isXhosa = languageName.toLowerCase() === 'xhosa'
		return this.LLM_SYSTEM_PROMPT.replace(
			'{:language}',
			isXhosa ? 'English' : languageName
		)
	}

	private generateUserPrompt(input: string): string {
		return this.LLM_INPUT_PROMPT.replace('{:input}', input)
	}

	private async processTranslations(
		translations: TranslationKeyValue[]
	): Promise<TranslationKeyValue[] | undefined> {
		const formattedInput = this.generateTranslationFormattedInput(translations)
		const systemPrompt = this.generateSystemPrompt(this.language.name)
		const userPrompt = this.generateUserPrompt(formattedInput)
		const result = await this.sendLLMRequest(
			systemPrompt,
			userPrompt,
			Object.keys(translations).map(String)
		)
		if (!result) {
			this.logger.log(
				'ERROR',
				`LLM request failed for ${this.language.name} on ${formattedInput}`
			)
			return undefined
		}
		return translations.map(
			(t, i) => new TranslationKeyValue(t.key, result[String(i)] ?? t.value)
		)
	}

	public async translate(
		translations: TranslationKeyValue[],
		options: { batchSize: number } = { batchSize: 50 }
	): Promise<TranslationKeyValue[] | undefined> {
		const batches = Array.from({
			length: Math.ceil(translations.length / options.batchSize)
		}).map((_, i) =>
			translations.slice(i * options.batchSize, (i + 1) * options.batchSize)
		)
		const result: TranslationKeyValue[] = []
		let progressPercentage = 0
		for (const batch of batches) {
			const batchResult = await this.processTranslations(batch)
			if (batchResult) result.push(...batchResult)
			progressPercentage = Math.round(
				((batches.indexOf(batch) + 1) / batches.length) * 100
			)
			this.logger.log('INFO', `Translation progress: ${progressPercentage}%`)
		}
		return result
	}
}

export class Language {
	private static entries: Map<string, string> = LANGUAGE_ENTRIES

	public static getLanguageCodes(): string[] {
		return Array.from(this.entries.keys())
	}

	public static getLanguageNames(): string[] {
		return Array.from(this.entries.values())
	}

	public static getLanguageByCode(
		code: string
	): { code: string; name: string } | undefined {
		const name = this.entries.get(code)
		return name ? { code, name } : undefined
	}

	public static getLanguageByName(
		name: string
	): { code: string; name: string } | undefined {
		for (const [code, langName] of this.entries.entries()) {
			if (langName.toLowerCase() === name.toLowerCase()) return { code, name }
		}
		return undefined
	}
}

export class TranslationJson {
	public json: Record<string, string | object> = {}

	constructor(public readonly source: TranslationUrl | TranslationFile) {}

	public async parse(): Promise<TranslationJson> {
		if (this.source instanceof TranslationFile) {
			this.json = JSON.parse(fs.readFileSync(this.source.path, 'utf-8'))
			return this
		} else {
			const response = await axios.get(this.source.url, {
				responseType: 'json'
			})
			this.json = response.data
			return this
		}
	}

	private isFlat(): boolean {
		return Object.values(this.json).every((v) => typeof v === 'string')
	}

	public setValue(key: string, value: string): TranslationJson {
		if (this.isFlat()) {
			this.json[key] = value
		} else {
			const keys = key.split('.')
			this.setJsonValue(this.json, keys, value)
		}
		return this
	}

	private setJsonValue(
		obj: Record<string, string | object>,
		keys: string[],
		value: string | object
	): void {
		if (keys.length === 0) return
		if (keys.length === 1) obj[keys[0]] = value
		else {
			const [firstKey, ...restKeys] = keys
			if (!(firstKey in obj) || typeof obj[firstKey] !== 'object') {
				// add new object if not exists
				obj[firstKey] = {}
			}
			this.setJsonValue(
				obj[firstKey] as Record<string, string | object>,
				restKeys,
				value
			)
		}
	}

	public getValue(key: string): TranslationKeyValue {
		if (this.isFlat()) {
			const value =
				typeof this.json[key] === 'string' ? (this.json[key] as string) : ''
			return new TranslationKeyValue(key, value)
		}
		const keys = key.split('.')
		const value = this.getJsonValue(this.json, keys)
		return new TranslationKeyValue(key, value ?? '')
	}

	private getJsonValue(
		obj: Record<string, string | object>,
		keys: string[]
	): string | undefined {
		if (keys.length === 0) return undefined
		if (keys.length === 1) {
			if (typeof obj[keys[0]] === 'string') return obj[keys[0]] as string
			return undefined
		}
		const [firstKey, ...restKeys] = keys
		if (!(firstKey in obj) || typeof obj[firstKey] !== 'object')
			return undefined
		return this.getJsonValue(
			obj[firstKey] as Record<string, string | object>,
			restKeys
		)
	}

	public write(): TranslationJson {
		if (this.source instanceof TranslationFile) {
			fs.writeFileSync(this.source.path, JSON.stringify(this.json, null, 2))
			return this
		}
		console.warn(`Write not supported for URL source`)
		return this
	}

	public flatten(): Map<string, string> {
		return this.flattenJson(this.json)
	}

	private flattenJson(
		object: Record<string, string | object>,
		parentKeys: string[] = [],
		result: Map<string, string> = new Map()
	): Map<string, string> {
		for (const [key, value] of Object.entries(object)) {
			const isObject = typeof value === 'object' && !Array.isArray(value)
			const isString = typeof value === 'string'
			if (isObject) {
				this.flattenJson(
					value as Record<string, string | object>,
					[...parentKeys, key],
					result
				)
			} else if (isString) {
				const fullKey =
					parentKeys.length > 0 ? `${parentKeys.join('.')}.${key}` : key
				result.set(fullKey, value)
			}
		}
		return result
	}

	public diff(other: TranslationJson) {
		const selfMap = this.flatten()
		const otherMap = other.flatten()
		const diff: TranslationKeyValue[] = []
		for (const [selfKey, selfValue] of selfMap.entries()) {
			const otherValue = otherMap.get(selfKey)
			if (otherValue === undefined || otherValue !== selfValue) {
				diff.push(new TranslationKeyValue(selfKey, selfValue))
			}
		}
		// check for keys in other that are not in self
		for (const [otherKey, otherValue] of otherMap.entries()) {
			if (!selfMap.has(otherKey)) {
				diff.push(new TranslationKeyValue(otherKey, otherValue))
			}
		}
		return diff
	}
}

export const getTranslationFilesFromPath = (
	path: string
): TranslationFile[] => {
	return fs
		.readdirSync(path)
		.filter((file) => file.endsWith('.json'))
		.map((file) => {
			const filePath = path + '/' + file
			return new TranslationFile(filePath, file)
		})
}
