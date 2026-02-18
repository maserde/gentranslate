import { patchTranslations } from '@/tools/translation.tools'

import { program } from 'commander'

program
	.name('reusely-translation')
	.description('A CLI tool for Reusely translation.')
	.version('0.0.1')
program
	.command(
		'patch <path-to-base-translation-file> <path-to-patched-translation-file> <path-to-output-folder>'
	)
	.action(patchTranslations)

program.parse()
