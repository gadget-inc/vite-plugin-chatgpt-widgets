{
  description = "Gadget js-clients development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "x86_64-darwin" "aarch64-darwin" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22;
      in {
        packages = {
          nodejs = node;
          corepack = pkgs.corepack;
          git = pkgs.git;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [ 
            node 
            corepack 
            git 
            playwright-driver.browsers
          ];
          
          # Playwright environment variables for Nix-provided browsers
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          
          shellHook = pkgs.lib.optionalString pkgs.stdenv.isLinux ''
            export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath (with pkgs; [
              playwright-driver.browsers
            ])}:$LD_LIBRARY_PATH
          '';
        };
      });
}
