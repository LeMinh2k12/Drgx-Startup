import sys


def main() -> None:
    data = list(map(int, sys.stdin.buffer.read().split()))
    if not data:
        return
    n = data[0]
    print(sum(data[1 : 1 + n]))


if __name__ == "__main__":
    main()
