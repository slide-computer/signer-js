type Job = () => Promise<unknown>;

export class Queue {
  #ongoing: Promise<void> = Promise.resolve();

  async schedule<T extends Job>(job: T): Promise<ReturnType<T>> {
    return new Promise<ReturnType<T>>((resolve, reject) => {
      this.#ongoing = this.#ongoing.finally(async () => {
        try {
          const value = (await job()) as ReturnType<T>;
          resolve(value);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}
