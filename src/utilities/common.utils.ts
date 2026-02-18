import { Logger } from '@/utilities/logger.utils'

export class SafeAsync<T> {
	public errors: Error[] = []
	private logger: Logger = new Logger()

	constructor(
		private readonly fn: () => Promise<T>,
		private readonly retries = 3
	) {}

	async run(): Promise<{ result: T | null; errors: Error[] }> {
		for (let i = 0; i < this.retries; i++) {
			try {
				return { result: await this.fn(), errors: [] }
			} catch (error) {
				this.errors.push(error as Error)
				if (i === this.retries - 1) {
					this.logger.log(
						'ERROR',
						`Max retries reached for ${this.fn.name}: ${error}`
					)
					break
				}
				this.logger.log(
					'WARN',
					`Retry ${i + 1} for ${this.fn.name} failed: ${error}`
				)
				await new Promise((resolve) =>
					setTimeout(resolve, Math.pow(2, i) * 1000)
				)
			}
		}
		return Promise.resolve({ result: null, errors: this.errors })
	}
}
