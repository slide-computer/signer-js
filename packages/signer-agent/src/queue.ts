export class Queue {
  #ongoing: Promise<void> = Promise.resolve();

  async schedule<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#ongoing = this.#ongoing.finally(async () => {
        try {
          resolve(await job());
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}
