cask "pikku" do
  version "0.0.0"

  on_arm do
    url "https://github.com/pikkujs/pikku/releases/download/%40pikku%2Fcli%40#{version}/pikku-darwin-arm64"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    binary "pikku-darwin-arm64", target: "pikku"
  end
  on_intel do
    url "https://github.com/pikkujs/pikku/releases/download/%40pikku%2Fcli%40#{version}/pikku-darwin-x64"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    binary "pikku-darwin-x64", target: "pikku"
  end

  name "Pikku"
  desc "Code generation tool for type-safe backend development"
  homepage "https://pikku.dev"
end
