import random


def main() -> None:
    n = random.randint(1, 30)
    print(n)
    print(*[random.randint(-10**9, 10**9) for _ in range(n)])


if __name__ == "__main__":
    main()
