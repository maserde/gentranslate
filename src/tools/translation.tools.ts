import { Logger } from '@/utilities/logger.utils'
import {
	getTranslationFilesFromPath,
	Language,
	LLMTranslation,
	TranslationFile,
	TranslationJson,
	TranslationKeyValue
} from '@/utilities/translation.utils'
import { SafeAsync } from '@/utilities/common.utils'

const logger = new Logger()

const getTranslationJsonFromFiles = async (
	files: TranslationFile[]
): Promise<TranslationJson[]> => {
	let result = []
	let queue: Promise<any>[] = []
	for (const file of files) {
		const isMaxConcurrency = queue.length % 10 === 0 && queue.length > 0
		if (isMaxConcurrency) {
			result.push(await Promise.allSettled(queue))
			queue = []
		}
		queue.push(new TranslationJson(file).parse())
	}
	const hasQueueUnprocessed = queue.length > 0
	if (hasQueueUnprocessed) {
		result.push(await Promise.allSettled(queue))
	}
	return result.flatMap((r) =>
		r.filter((r) => r.status === 'fulfilled').map((r) => r.value)
	)
}

const getLanguageCodeByTranslationJson = (translation: TranslationJson) => {
	const filePath =
		translation.source instanceof TranslationFile
			? translation.source.path
			: translation.source.url
	const fileName = filePath.split('/').pop()
	if (!fileName) return undefined
	return Language.getLanguageByCode(fileName.replace('.json', ''))
}

const translatePatch = async (
	translations: TranslationJson[],
	diff: TranslationKeyValue[],
	options: { batchSize: number } = { batchSize: 10 }
) => {
	const { batchSize = 10 } = options
	const translationDiffKeys = diff.map((d) => d.key).join(', ')
	let queue: Promise<any>[] = []
	let completed = 0

	for (const translation of translations) {
		const language = getLanguageCodeByTranslationJson(translation)
		const translationPath =
			translation.source instanceof TranslationFile
				? translation.source.path
				: translation.source.url
		if (!language) {
			logger.log(
				'WARN',
				`Skipping translation file ${translationPath} because language code could not be determined`
			)
			continue
		}

		logger.log(
			'INFO',
			`Translating key-value pairs for ${translationPath} on these keys: ${translationDiffKeys}`
		)

		if (queue.length % batchSize === 0 && queue.length > 0) {
			completed += queue.length
			const progressPercentage = Math.round(
				(completed / translations.length) * 100
			)
			logger.log('INFO', `Translation progress: ${progressPercentage}%`)
			logger.log(
				'INFO',
				`Waiting for ${queue.length} tasks to complete before proceeding`
			)
			await Promise.all(queue)
			queue = []
		}

		queue.push(
			new SafeAsync(async (): Promise<void> => {
				const translates = await new LLMTranslation(language).translate(diff)

				if (translates) {
					for (const translated of translates) {
						translation.setValue(translated.key, translated.value)
					}
				}

				logger.log(
					'INFO',
					`Finished translating ${translationPath} for ${language.name}`
				)
				logger.log('INFO', `Writing ${translationPath}`)
				translation.write()
			}).run()
		)
	}
}

export const patchTranslations = async (
	baseTranslationFilePath: string,
	patchedTranslationFilePath: string,
	outputFolderPath: string,
	options: { includeLanguages: string } = {
		includeLanguages: ''
	}
) => {
	const includeLanguages = options.includeLanguages
		? options.includeLanguages.replaceAll(/ /g, '').split(',')
		: []

	logger.log('INFO', `Checking output folder for existing translation files`)
	const existingFiles: TranslationFile[] =
		getTranslationFilesFromPath(outputFolderPath)

	logger.log('INFO', `Found ${existingFiles.length} existing translation files`)
	logger.log('INFO', `Check if existing translation files are valid`)
	let translations: TranslationJson[] =
		await getTranslationJsonFromFiles(existingFiles)

	logger.log(
		'INFO',
		`Existing translation files are successfully validated. Found ${translations.length} valid files and ${existingFiles.length - translations.length} invalid files. Skipping invalid files`
	)
	logger.log('INFO', `Loading base translation from ${baseTranslationFilePath}`)

	if (includeLanguages.length > 0) {
		logger.log(
			'INFO',
			`Filtering translations for languages: ${includeLanguages.join(', ')}`
		)
		translations = translations.filter((translation) => {
			const language = getLanguageCodeByTranslationJson(translation)
			return language && includeLanguages.includes(language.code)
		})
		logger.log('INFO', `Filtered to only ${translations.length} translations`)
	}

	const baseTranslation = await new TranslationJson(
		new TranslationFile(baseTranslationFilePath)
	).parse()

	logger.log(
		'INFO',
		`Loading patched translation from ${patchedTranslationFilePath}`
	)
	const patchedTranslation = await new TranslationJson(
		new TranslationFile(patchedTranslationFilePath)
	).parse()

	logger.log('INFO', `Comparing translations`)
	const diff = baseTranslation.diff(patchedTranslation)

	logger.log('INFO', `Found ${diff.length} differences`)
	await translatePatch(translations, diff)
}
