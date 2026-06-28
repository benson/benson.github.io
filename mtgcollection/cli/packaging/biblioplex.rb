# Homebrew formula for the biblioplex CLI.
#
# This file belongs in a Homebrew *tap* repo (e.g. github.com/<owner>/homebrew-tap
# as Formula/biblioplex.rb), NOT in this repo. The cli-release workflow updates
# `url` + `sha256` automatically on each `cli-v*` tag. It is kept here as the
# source of truth / starting point.
#
# Per Homebrew's Node guidance: depend on node (do not bundle it), install with
# std_npm_args, and symlink the package bins.
class Biblioplex < Formula
  desc "Manage your biblioplex Magic: The Gathering collection from the terminal"
  homepage "https://biblioplex.bensonperry.com"
  url "https://registry.npmjs.org/biblioplex/-/biblioplex-0.1.0.tgz"
  sha256 "REPLACE_WITH_TARBALL_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/biblioplex --version")
  end
end
