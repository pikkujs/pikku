import { Box, Center, Loader } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { Sidebar, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from "@/components/project/Sidebar";
import { PikkuMetaProvider, usePikkuMeta } from "@/context/PikkuMetaContext";
import { SpotlightSearch } from "@/components/search/SpotlightSearch";
import { ConnectionScreen } from "@/components/layout/ConnectionScreen";

const AppLayoutInner: React.FunctionComponent<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, error } = usePikkuMeta();
  const [collapsed] = useLocalStorage({
    key: "sidebar-collapsed",
    defaultValue: false,
  });

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return <ConnectionScreen error={error} />;
  }

  return (
    <>
      <SpotlightSearch />
      <Sidebar />
      <Box
        ml={sidebarWidth}
        h="100vh"
        style={{ transition: "margin-left 200ms ease" }}
      >
        {children}
      </Box>
    </>
  );
};

export const AppLayout: React.FunctionComponent<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <PikkuMetaProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </PikkuMetaProvider>
  );
};
